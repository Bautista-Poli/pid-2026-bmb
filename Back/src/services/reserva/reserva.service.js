// Reservas del conductor: crear sin sobreventa, listar y cancelar; y las
// recibidas por un estacionamiento. En esta carpeta: el ciclo del propietario
// (reserva-ciclo.service.js), la disponibilidad, los vencimientos automaticos,
// la maquina de estados (reserva-estados.js), el detalle y las validaciones.
import { query, withTransaction } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { instanteLocal, sumarDias } from '../../utils/horario.js';
import { ESTADOS_RESERVA, ESTADOS_VIGENTES, ORIGENES_CANCELACION } from '../../utils/roles.js';
import { MODALIDADES } from '../../utils/tarifas.js';
import { validarAbonoParaReservar } from '../abono.service.js';
import { asegurarPropiedad } from '../estacionamiento/estacionamiento.service.js';
import { obtenerDetalle, selectDetalle } from './reserva-detalle.js';
import { MENSAJE_NO_SHOW, cambiarEstado, limiteIngreso } from './reserva-estados.js';
import {
  asegurarVehiculoLibre,
  asignarCochera,
  bloquearCochera,
  obtenerVehiculo,
  precioDe,
  validarHorario,
} from './reserva-validaciones.js';

const VIOLACION_EXCLUSION = '23P01';

// Un propietario que tambien es conductor no reserva en lo suyo.
export const MENSAJE_PROPIO = 'No podes reservar en un estacionamiento propio';

// Modalidad de las reservas hechas con un abono: no se cobra (ya se pago el
// abono). No esta en MODALIDADES porque el conductor no la elige: sale de `id_abono`.
const MODALIDAD_ABONO = 'ABONO';

/**
 * Crea una reserva garantizando que ninguna cochera quede sobrevendida.
 *
 * Se puede pedir de dos formas:
 *   - `id_estacionamiento`: el backend asigna la primera cochera libre que
 *     admita el vehiculo (es lo que usa la app).
 *   - `id_cochera`: reserva esa cochera puntual.
 *
 * En ambos casos las cocheras candidatas se bloquean con SELECT ... FOR UPDATE
 * antes de buscar solapamientos. Eso serializa los pedidos concurrentes: el
 * segundo espera el commit del primero y ya ve su reserva. (Bloquear solo las
 * reservas existentes no alcanza: no impide que dos transacciones inserten
 * filas nuevas que se pisan entre si.)
 *
 * Ademas, el EXCLUDE constraint `reserva_sin_solapamiento` (ver schema.sql)
 * repite la garantia a nivel base de datos; si salta, se traduce a un 409.
 */
export async function crear(
  idConductor,
  { id_cochera, id_estacionamiento, id_vehiculo, inicio, fin, modalidad = MODALIDADES.HORA, id_abono },
) {
  return withTransaction(async (client) => {
    // El abono se bloquea primero (orden fijo: abono -> vehiculo -> cocheras).
    const abono = id_abono
      ? await validarAbonoParaReservar(client, id_abono, idConductor, inicio, fin)
      : null;

    const vehiculo = await obtenerVehiculo(client, id_vehiculo, idConductor);
    await asegurarVehiculoLibre(client, id_vehiculo, inicio, fin);

    const cochera = id_cochera
      ? await bloquearCochera(client, id_cochera, vehiculo, inicio, fin, { conAbono: Boolean(abono) })
      : await asignarCochera(client, abono?.id_estacionamiento ?? id_estacionamiento, vehiculo, inicio, fin, {
          conAbono: Boolean(abono),
        });

    if (cochera.id_propietario === idConductor) {
      throw ApiError.conflict(MENSAJE_PROPIO);
    }

    if (abono && cochera.id_estacionamiento !== abono.id_estacionamiento) {
      throw ApiError.conflict('El abono es de otro estacionamiento');
    }

    // Con abono no se cobra y se valida como una reserva por hora (todo el rango en horario).
    const precio = abono ? 0 : await precioDe(client, cochera.id_estacionamiento, modalidad, inicio, fin);
    await validarHorario(client, cochera.id_estacionamiento, inicio, fin, abono ? MODALIDADES.HORA : modalidad);

    let idReserva;
    try {
      const { rows } = await client.query(
        `INSERT INTO reserva
           (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, modalidad, precio_total, id_abono)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id_reserva`,
        [
          idConductor,
          id_vehiculo,
          cochera.id_cochera,
          inicio,
          fin,
          // Con abono ya esta paga: nace confirmada (supuesto de la spec, pregunta 6).
          abono ? ESTADOS_RESERVA.CONFIRMADA : ESTADOS_RESERVA.PENDIENTE,
          abono ? MODALIDAD_ABONO : modalidad,
          precio,
          abono?.id_abono ?? null,
        ],
      );
      idReserva = rows[0].id_reserva;
    } catch (error) {
      if (error.code === VIOLACION_EXCLUSION) {
        throw ApiError.conflict(
          error.constraint === 'reserva_vehiculo_sin_solapamiento'
            ? 'El vehiculo ya tiene una reserva que se superpone con esa franja'
            : 'La cochera ya esta reservada en esa franja horaria',
        );
      }
      throw error;
    }

    return obtenerDetalle(client, idReserva, { conCodigo: true, vista: 'CONDUCTOR' });
  });
}

/** Las reservas del conductor, de la que empieza mas tarde a la mas temprana (con su codigo de acceso). */
export async function listarPorConductor(idConductor) {
  const { rows } = await query(
    `${selectDetalle({ conCodigo: true, vista: 'CONDUCTOR' })} WHERE r.id_conductor = $1 ORDER BY r.inicio DESC`,
    [idConductor],
  );
  return rows;
}

/** Reservas recibidas por un estacionamiento propio; con `fecha`, las que tocan ese dia. */
export async function listarPorEstacionamiento(idEstacionamiento, idPropietario, { fecha } = {}) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const condiciones = ['c.id_estacionamiento = $1'];
  const parametros = [idEstacionamiento];

  if (fecha) {
    parametros.push(instanteLocal(fecha, '00:00'), instanteLocal(sumarDias(fecha, 1), '00:00'));
    condiciones.push('r.inicio < $3 AND r.fin > $2');
  }

  const { rows } = await query(
    `${selectDetalle()} WHERE ${condiciones.join(' AND ')} ORDER BY r.inicio`,
    parametros,
  );
  return rows;
}

/**
 * El conductor cancela una reserva propia que todavia no arranco (PENDIENTE o
 * CONFIRMADA). La politica de cancelacion del estacionamiento (horas minimas
 * de anticipacion) solo aplica una vez CONFIRMADA: mientras esta PENDIENTE el
 * dueño todavia no la acepto, asi que el conductor se puede arrepentir libre.
 */
export async function cancelar(idReserva, idConductor) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT r.id_reserva, r.id_conductor, r.estado, r.inicio, r.fin,
              e.politica_cancelacion_horas
         FROM reserva r
         JOIN cochera c         ON c.id_cochera = r.id_cochera
         JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
        WHERE r.id_reserva = $1
        FOR UPDATE OF r`,
      [idReserva],
    );

    const reserva = rows[0];
    if (!reserva) throw ApiError.notFound('La reserva no existe');
    if (reserva.id_conductor !== idConductor) {
      throw ApiError.forbidden('La reserva pertenece a otro conductor');
    }
    if (reserva.estado === ESTADOS_RESERVA.ACTIVA) {
      throw ApiError.conflict('La reserva ya esta en curso');
    }
    if (reserva.estado === ESTADOS_RESERVA.NO_SHOW) throw ApiError.conflict(MENSAJE_NO_SHOW);
    if (!ESTADOS_VIGENTES.includes(reserva.estado)) {
      throw ApiError.conflict(`La reserva ya esta ${reserva.estado.toLowerCase()}`);
    }
    if (reserva.fin <= new Date()) {
      throw ApiError.conflict('La reserva ya termino');
    }
    // Pasada la tolerancia ya es un no-show (aunque la revision de vencimientos no la haya marcado):
    // cancelarla ahi la sacaria de la estadistica de ausentes.
    if (reserva.estado === ESTADOS_RESERVA.CONFIRMADA && Date.now() > limiteIngreso(reserva)) {
      throw ApiError.conflict(MENSAJE_NO_SHOW);
    }
    if (reserva.estado === ESTADOS_RESERVA.CONFIRMADA && reserva.politica_cancelacion_horas != null) {
      const margenMs = reserva.politica_cancelacion_horas * 60 * 60 * 1000;
      if (reserva.inicio.getTime() - Date.now() < margenMs) {
        throw ApiError.conflict(
          `Este estacionamiento exige cancelar con ${reserva.politica_cancelacion_horas} hora(s) de anticipacion`,
        );
      }
    }

    await cambiarEstado(client, reserva, ESTADOS_RESERVA.CANCELADA, {
      canceladaPor: ORIGENES_CANCELACION.CONDUCTOR,
    });

    return obtenerDetalle(client, idReserva, { conCodigo: true, vista: 'CONDUCTOR' });
  });
}
