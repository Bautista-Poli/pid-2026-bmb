// Chequeos al crear una reserva (los usa crear() en reserva.service.js): el
// vehiculo, la cochera (puntual o asignada), el precio y el horario.
import { ApiError } from '../../utils/ApiError.js';
import { motivoFueraDeHorario, motivoIngresoFueraDeHorario } from '../../utils/horario.js';
import { ESTADOS_COCHERA, ESTADOS_VIGENTES } from '../../utils/roles.js';
import { finEfectivo } from '../../utils/solapamiento.js';
import { CAMPOS_TARIFA, MODALIDADES, precioDeReserva } from '../../utils/tarifas.js';
import { buscarCocheraLibre } from '../cochera/cochera-libre.js';
import { aceptaReservas } from '../estacionamiento/estacionamiento.service.js';

/**
 * Bloquea la fila del vehiculo: dos pedidos simultaneos con el mismo vehiculo
 * se serializan, y el segundo ya ve la reserva del primero. Siempre se toma
 * antes que las cocheras, asi el orden de bloqueo es fijo y no hay deadlocks.
 */
export async function obtenerVehiculo(client, idVehiculo, idConductor) {
  const { rows } = await client.query(
    `SELECT id_vehiculo, id_tipo_vehiculo, patente, activo
       FROM vehiculo
      WHERE id_vehiculo = $1 AND id_conductor = $2
      FOR UPDATE`,
    [idVehiculo, idConductor],
  );

  const vehiculo = rows[0];
  if (!vehiculo) throw ApiError.notFound('El vehiculo no existe o no pertenece al conductor');
  if (!vehiculo.activo) throw ApiError.conflict('El vehiculo esta dado de baja');
  return vehiculo;
}

/**
 * Un vehiculo no puede estar en dos reservas vigentes que se superpongan. Si
 * sigue adentro pasado su `fin` (auto excedido), esa reserva cuenta como sin
 * fin (finEfectivo): el EXCLUDE de la base usa `fin` y no lo ve.
 */
export async function asegurarVehiculoLibre(client, idVehiculo, inicio, fin) {
  const { rows } = await client.query(
    `SELECT r.id_reserva, r.inicio, r.fin, e.nombre AS estacionamiento
       FROM reserva r
       JOIN cochera c         ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE r.id_vehiculo = $1
        AND r.estado = ANY($2::estado_reserva[])
        AND r.inicio < $4
        AND ${finEfectivo('r')} > $3
      ORDER BY r.inicio
      LIMIT 1`,
    [idVehiculo, ESTADOS_VIGENTES, inicio, fin],
  );

  if (rows.length > 0) {
    const conflicto = rows[0];
    throw ApiError.conflict('El vehiculo ya tiene una reserva que se superpone con esa franja', {
      reserva_en_conflicto: {
        id_reserva: conflicto.id_reserva,
        estacionamiento: conflicto.estacionamiento,
        inicio: conflicto.inicio,
        fin: conflicto.fin,
      },
    });
  }
}

/** Reserva de una cochera puntual: lock sobre esa fila y validaciones. */
export async function bloquearCochera(client, idCochera, vehiculo, inicio, fin, { conAbono = false } = {}) {
  const { rows: cocheras } = await client.query(
    `SELECT c.id_cochera, c.identificador, c.estado_actual, c.activo, c.bloqueada,
            c.id_tipo_vehiculo, c.id_estacionamiento, e.id_propietario,
            e.publicado, e.estado_aprobacion, e.activo AS estacionamiento_activo
       FROM cochera c
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE c.id_cochera = $1
      FOR UPDATE OF c`,
    [idCochera],
  );

  const cochera = cocheras[0];
  if (!cochera) throw ApiError.notFound('La cochera no existe');

  if (!cochera.activo || cochera.estado_actual === ESTADOS_COCHERA.INACTIVA || cochera.bloqueada) {
    throw ApiError.conflict('La cochera no esta disponible para reservar');
  }
  if (!aceptaReservas({ ...cochera, activo: cochera.estacionamiento_activo }, { conAbono })) {
    throw ApiError.conflict('El estacionamiento no esta disponible para reservar');
  }
  if (vehiculo.id_tipo_vehiculo !== cochera.id_tipo_vehiculo) {
    throw ApiError.conflict('La cochera no admite el tipo de vehiculo seleccionado');
  }

  const { rows: solapadas } = await client.query(
    `SELECT r.id_reserva, r.inicio, r.fin, r.estado
       FROM reserva r
      WHERE r.id_cochera = $1
        AND r.estado = ANY($2::estado_reserva[])
        AND r.inicio < $4
        AND ${finEfectivo('r')} > $3
      ORDER BY r.inicio
      LIMIT 1`,
    [idCochera, ESTADOS_VIGENTES, inicio, fin],
  );

  if (solapadas.length > 0) {
    const conflicto = solapadas[0];
    throw ApiError.conflict('La cochera ya esta reservada en esa franja horaria', {
      id_cochera: idCochera,
      reserva_en_conflicto: {
        id_reserva: conflicto.id_reserva,
        inicio: conflicto.inicio,
        fin: conflicto.fin,
        estado: conflicto.estado,
      },
    });
  }

  return cochera;
}

/**
 * Asignacion automatica. Se bloquean todas las cocheras compatibles, siempre
 * en el mismo orden (por id), y recien despues se busca la primera sin
 * solapamiento. El orden fijo evita deadlocks entre pedidos simultaneos.
 */
export async function asignarCochera(client, idEstacionamiento, vehiculo, inicio, fin, { conAbono = false } = {}) {
  const { rows: estacionamientos } = await client.query(
    'SELECT id_propietario, publicado, activo, estado_aprobacion FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  const estacionamiento = estacionamientos[0];
  if (!estacionamiento) throw ApiError.notFound('El estacionamiento no existe');
  if (!aceptaReservas(estacionamiento, { conAbono })) {
    throw ApiError.conflict('El estacionamiento no esta disponible para reservar');
  }

  const { candidatas, libre } = await buscarCocheraLibre(client, {
    idEstacionamiento,
    idTipoVehiculo: vehiculo.id_tipo_vehiculo,
    inicio,
    fin,
  });
  if (candidatas === 0) {
    throw ApiError.conflict('El estacionamiento no tiene cocheras para ese tipo de vehiculo');
  }
  if (!libre) {
    throw ApiError.conflict('No quedan cocheras libres para ese vehiculo en esa franja horaria');
  }

  return { ...libre, id_propietario: estacionamiento.id_propietario };
}

/** Precio de la reserva segun la tarifa vigente; 409 si el estacionamiento no ofrece la modalidad. */
export async function precioDe(client, idEstacionamiento, modalidad, inicio, fin) {
  const { rows } = await client.query(
    `SELECT ${CAMPOS_TARIFA.join(', ')} FROM estacionamiento WHERE id_estacionamiento = $1`,
    [idEstacionamiento],
  );

  const precio = precioDeReserva(modalidad, rows[0], inicio, fin);
  if (precio === null) {
    throw ApiError.conflict(`El estacionamiento no ofrece la modalidad ${modalidad}`);
  }
  return precio;
}

/**
 * Por hora se valida todo el rango. Estadia y jornada duran 12 y 24 horas, que
 * violarian cualquier horario que no sea corrido: solo se valida el ingreso.
 */
export async function validarHorario(client, idEstacionamiento, inicio, fin, modalidad) {
  const { rows: horarios } = await client.query(
    'SELECT dia_semana, hora_apertura, hora_cierre FROM horario WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  const motivo =
    modalidad === MODALIDADES.HORA
      ? motivoFueraDeHorario(horarios, inicio, fin)
      : motivoIngresoFueraDeHorario(horarios, inicio);
  if (motivo) throw ApiError.conflict(motivo);
}
