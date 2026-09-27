import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import {
  FRANJAS_ESTANDAR,
  instanteLocal,
  motivoFueraDeHorario,
  motivoIngresoFueraDeHorario,
  sumarDias,
} from '../utils/horario.js';
import { ESTADOS_COCHERA, ESTADOS_RESERVA, ESTADOS_VIGENTES } from '../utils/roles.js';
import { CAMPOS_TARIFA, MODALIDADES, precioDeReserva } from '../utils/tarifas.js';
import { ORDEN_NATURAL } from './cochera.service.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_EXCLUSION = '23P01';

// El vehiculo puede llegar hasta 30 minutos antes de su franja.
const MARGEN_INGRESO_MS = 30 * 60 * 1000;

/** Reserva con todo lo que muestran los listados, con la modalidad y el precio guardados al reservar. */
const SELECT_DETALLE = `
  SELECT r.id_reserva, r.id_conductor, r.inicio, r.fin, r.created_at,
         r.ingreso_real, r.egreso_real,
         CASE WHEN r.estado = 'CONFIRMADA' AND r.ingreso_real IS NOT NULL
              THEN 'EN_CURSO' ELSE r.estado::text END AS estado,
         r.id_vehiculo, v.patente, v.marca, v.modelo, v.id_tipo_vehiculo,
         r.id_cochera, c.identificador AS cochera,
         c.sector AS cochera_sector, c.cubierta AS cochera_cubierta,
         e.id_estacionamiento, e.nombre AS estacionamiento, e.direccion,
         r.modalidad, r.precio_total,
         u.nombre AS conductor_nombre, u.apellido AS conductor_apellido
    FROM reserva r
    JOIN vehiculo v        ON v.id_vehiculo = r.id_vehiculo
    JOIN cochera c         ON c.id_cochera = r.id_cochera
    JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
    JOIN usuario u         ON u.id_usuario = r.id_conductor
`;

/**
 * Condicion SQL "la cochera `c` no tiene reservas vigentes que se pisen con
 * [inicio, fin)". Recibe los placeholders de los parametros.
 * Dos rangos [a, b) y [c, d) se solapan si  a < d  AND  b > c.
 */
function sinSolapamiento(estados, inicio, fin) {
  return `NOT EXISTS (
    SELECT 1 FROM reserva r
     WHERE r.id_cochera = c.id_cochera
       AND r.estado = ANY(${estados}::estado_reserva[])
       AND r.inicio < ${fin}
       AND r.fin > ${inicio}
  )`;
}

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
  { id_cochera, id_estacionamiento, id_vehiculo, inicio, fin, modalidad = MODALIDADES.HORA },
) {
  return withTransaction(async (client) => {
    const vehiculo = await obtenerVehiculo(client, id_vehiculo, idConductor);
    await asegurarVehiculoLibre(client, id_vehiculo, inicio, fin);

    const cochera = id_cochera
      ? await bloquearCochera(client, id_cochera, vehiculo, inicio, fin)
      : await asignarCochera(client, id_estacionamiento, vehiculo, inicio, fin);

    const precio = await precioDe(client, cochera.id_estacionamiento, modalidad, inicio, fin);
    await validarHorario(client, cochera.id_estacionamiento, inicio, fin, modalidad);

    let idReserva;
    try {
      const { rows } = await client.query(
        `INSERT INTO reserva
           (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, modalidad, precio_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id_reserva`,
        [
          idConductor,
          id_vehiculo,
          cochera.id_cochera,
          inicio,
          fin,
          ESTADOS_RESERVA.PENDIENTE,
          modalidad,
          precio,
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

    return obtenerDetalle(client, idReserva);
  });
}

/**
 * Bloquea la fila del vehiculo: dos pedidos simultaneos con el mismo vehiculo
 * se serializan, y el segundo ya ve la reserva del primero. Siempre se toma
 * antes que las cocheras, asi el orden de bloqueo es fijo y no hay deadlocks.
 */
async function obtenerVehiculo(client, idVehiculo, idConductor) {
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

/** Un vehiculo no puede estar en dos reservas vigentes que se superpongan. */
async function asegurarVehiculoLibre(client, idVehiculo, inicio, fin) {
  const { rows } = await client.query(
    `SELECT r.id_reserva, r.inicio, r.fin, e.nombre AS estacionamiento
       FROM reserva r
       JOIN cochera c         ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE r.id_vehiculo = $1
        AND r.estado = ANY($2::estado_reserva[])
        AND r.inicio < $4
        AND r.fin > $3
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
async function bloquearCochera(client, idCochera, vehiculo, inicio, fin) {
  const { rows: cocheras } = await client.query(
    `SELECT c.id_cochera, c.identificador, c.estado_actual, c.activo,
            c.id_tipo_vehiculo, c.id_estacionamiento,
            e.publicado, e.activo AS estacionamiento_activo
       FROM cochera c
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE c.id_cochera = $1
      FOR UPDATE OF c`,
    [idCochera],
  );

  const cochera = cocheras[0];
  if (!cochera) throw ApiError.notFound('La cochera no existe');

  if (!cochera.activo || cochera.estado_actual === ESTADOS_COCHERA.INACTIVA) {
    throw ApiError.conflict('La cochera no esta disponible para reservar');
  }
  if (!cochera.estacionamiento_activo || !cochera.publicado) {
    throw ApiError.conflict('El estacionamiento no esta publicado');
  }
  if (vehiculo.id_tipo_vehiculo !== cochera.id_tipo_vehiculo) {
    throw ApiError.conflict('La cochera no admite el tipo de vehiculo seleccionado');
  }

  const { rows: solapadas } = await client.query(
    `SELECT id_reserva, inicio, fin, estado
       FROM reserva
      WHERE id_cochera = $1
        AND estado = ANY($2::estado_reserva[])
        AND inicio < $4
        AND fin > $3
      ORDER BY inicio
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
async function asignarCochera(client, idEstacionamiento, vehiculo, inicio, fin) {
  const { rows: estacionamientos } = await client.query(
    'SELECT publicado, activo FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  const estacionamiento = estacionamientos[0];
  if (!estacionamiento) throw ApiError.notFound('El estacionamiento no existe');
  if (!estacionamiento.activo || !estacionamiento.publicado) {
    throw ApiError.conflict('El estacionamiento no esta publicado');
  }

  const { rows: candidatas } = await client.query(
    `SELECT c.id_cochera
       FROM cochera c
      WHERE c.id_estacionamiento = $1
        AND c.activo
        AND c.estado_actual <> $2
        AND c.id_tipo_vehiculo = $3
      ORDER BY c.id_cochera
      FOR UPDATE`,
    [idEstacionamiento, ESTADOS_COCHERA.INACTIVA, vehiculo.id_tipo_vehiculo],
  );

  if (candidatas.length === 0) {
    throw ApiError.conflict('El estacionamiento no tiene cocheras para ese tipo de vehiculo');
  }

  const { rows: libres } = await client.query(
    `SELECT c.id_cochera, c.id_estacionamiento, c.identificador
       FROM cochera c
      WHERE c.id_cochera = ANY($1::uuid[])
        AND ${sinSolapamiento('$2', '$3', '$4')}
      ORDER BY ${ORDEN_NATURAL}
      LIMIT 1`,
    [candidatas.map((c) => c.id_cochera), ESTADOS_VIGENTES, inicio, fin],
  );

  if (!libres[0]) {
    throw ApiError.conflict('No quedan cocheras libres para ese vehiculo en esa franja horaria');
  }

  return libres[0];
}

/** Precio de la reserva segun la tarifa vigente; 409 si el estacionamiento no ofrece la modalidad. */
async function precioDe(client, idEstacionamiento, modalidad, inicio, fin) {
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
async function validarHorario(client, idEstacionamiento, inicio, fin, modalidad) {
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

/** `ejecutor` es el client de una transaccion o cualquier objeto con `query`. */
async function obtenerDetalle(ejecutor, idReserva) {
  const { rows } = await ejecutor.query(`${SELECT_DETALLE} WHERE r.id_reserva = $1`, [idReserva]);
  return rows[0];
}

export async function listarPorConductor(idConductor) {
  const { rows } = await query(
    `${SELECT_DETALLE} WHERE r.id_conductor = $1 ORDER BY r.inicio DESC`,
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
    `${SELECT_DETALLE} WHERE ${condiciones.join(' AND ')} ORDER BY r.inicio`,
    parametros,
  );
  return rows;
}

/** El conductor cancela una reserva propia que todavia no termino. */
export async function cancelar(idReserva, idConductor) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id_conductor, estado, fin, ingreso_real
         FROM reserva WHERE id_reserva = $1 FOR UPDATE`,
      [idReserva],
    );

    const reserva = rows[0];
    if (!reserva) throw ApiError.notFound('La reserva no existe');
    if (reserva.id_conductor !== idConductor) {
      throw ApiError.forbidden('La reserva pertenece a otro conductor');
    }
    if (reserva.ingreso_real) throw ApiError.conflict('La reserva ya esta en curso');
    if (!ESTADOS_VIGENTES.includes(reserva.estado)) {
      throw ApiError.conflict(`La reserva ya esta ${reserva.estado.toLowerCase()}`);
    }
    if (reserva.fin <= new Date()) {
      throw ApiError.conflict('La reserva ya termino');
    }

    await client.query('UPDATE reserva SET estado = $1 WHERE id_reserva = $2', [
      ESTADOS_RESERVA.CANCELADA,
      idReserva,
    ]);

    return obtenerDetalle(client, idReserva);
  });
}

/* -------------------------- ciclo de la reserva ---------------------------
   El propietario la confirma, despues registra el ingreso del vehiculo y por
   ultimo el egreso, que la finaliza y libera la cochera:

     PENDIENTE -> CONFIRMADA -> (ingreso) EN_CURSO -> (egreso) FINALIZADA

   "EN_CURSO" no es un estado de la base: es una reserva CONFIRMADA con
   `ingreso_real` cargado. El conductor puede cancelar hasta el ingreso.
-------------------------------------------------------------------------- */

/** Bloquea la reserva y verifica que la cochera sea de un estacionamiento propio. */
async function bloquearReservaDelPropietario(client, idReserva, idPropietario) {
  const { rows } = await client.query(
    `SELECT r.id_reserva, r.estado, r.inicio, r.fin, r.ingreso_real, r.egreso_real,
            r.id_cochera, e.id_propietario
       FROM reserva r
       JOIN cochera c         ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE r.id_reserva = $1
      FOR UPDATE OF r`,
    [idReserva],
  );

  const reserva = rows[0];
  if (!reserva) throw ApiError.notFound('La reserva no existe');
  if (reserva.id_propietario !== idPropietario) {
    throw ApiError.forbidden('La reserva es de otro estacionamiento');
  }
  return reserva;
}

/** El propietario acepta una reserva pendiente. */
export async function confirmar(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);

    if (reserva.estado !== ESTADOS_RESERVA.PENDIENTE) {
      throw ApiError.conflict(`La reserva ya esta ${reserva.estado.toLowerCase()}`);
    }
    if (reserva.fin <= new Date()) throw ApiError.conflict('La reserva ya termino');

    await client.query('UPDATE reserva SET estado = $1 WHERE id_reserva = $2', [
      ESTADOS_RESERVA.CONFIRMADA,
      idReserva,
    ]);

    return obtenerDetalle(client, idReserva);
  });
}

/** Llego el vehiculo: se guarda la hora y la cochera pasa a OCUPADA. */
export async function registrarIngreso(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);

    if (reserva.estado !== ESTADOS_RESERVA.CONFIRMADA) {
      throw ApiError.conflict(
        reserva.estado === ESTADOS_RESERVA.PENDIENTE
          ? 'Primero hay que confirmar la reserva'
          : `La reserva esta ${reserva.estado.toLowerCase()}`,
      );
    }
    if (reserva.ingreso_real) throw ApiError.conflict('El ingreso ya estaba registrado');

    const ahora = Date.now();
    if (ahora < reserva.inicio.getTime() - MARGEN_INGRESO_MS) {
      throw ApiError.conflict('Todavia es muy temprano para registrar el ingreso');
    }
    if (ahora > reserva.fin.getTime()) throw ApiError.conflict('La franja de la reserva ya termino');

    await client.query('UPDATE reserva SET ingreso_real = now() WHERE id_reserva = $1', [idReserva]);
    await client.query('UPDATE cochera SET estado_actual = $1 WHERE id_cochera = $2', [
      ESTADOS_COCHERA.OCUPADA,
      reserva.id_cochera,
    ]);

    return obtenerDetalle(client, idReserva);
  });
}

/** Se fue el vehiculo: la reserva queda FINALIZADA y la cochera libre. */
export async function registrarEgreso(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);

    if (!reserva.ingreso_real) throw ApiError.conflict('La reserva todavia no tiene ingreso');
    if (reserva.egreso_real) throw ApiError.conflict('El egreso ya estaba registrado');

    await client.query(
      'UPDATE reserva SET egreso_real = now(), estado = $1 WHERE id_reserva = $2',
      [ESTADOS_RESERVA.FINALIZADA, idReserva],
    );
    await client.query('UPDATE cochera SET estado_actual = $1 WHERE id_cochera = $2', [
      ESTADOS_COCHERA.LIBRE,
      reserva.id_cochera,
    ]);

    return obtenerDetalle(client, idReserva);
  });
}

/**
 * Franjas del dia con la cantidad de cocheras libres. `motivo` explica por
 * que una franja no se puede reservar (fuera de horario, ya empezo o sin lugar).
 */
export async function disponibilidad(idEstacionamiento, { fecha, id_tipo_vehiculo }) {
  const { rows } = await query(
    'SELECT publicado, activo FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');
  if (!rows[0].publicado || !rows[0].activo) {
    throw ApiError.conflict('El estacionamiento no esta publicado');
  }

  const { rows: horarios } = await query(
    'SELECT dia_semana, hora_apertura, hora_cierre FROM horario WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  const franjas = [];
  for (const franja of FRANJAS_ESTANDAR) {
    const inicio = instanteLocal(fecha, franja.hora_desde);
    const fin = instanteLocal(fecha, franja.hora_hasta);

    let motivo = motivoFueraDeHorario(horarios, inicio, fin);
    // Mismo margen que el validador de reservas: no se reserva lo que ya empezo.
    if (!motivo && inicio.getTime() < Date.now() - 60_000) {
      motivo = 'La franja ya empezo';
    }

    let libres = 0;
    if (!motivo) {
      const { rows: conteo } = await query(
        `SELECT COUNT(*)::int AS libres
           FROM cochera c
          WHERE c.id_estacionamiento = $1
            AND c.activo
            AND c.estado_actual <> $2
            AND ($3::smallint IS NULL OR c.id_tipo_vehiculo = $3)
            AND ${sinSolapamiento('$4', '$5', '$6')}`,
        [
          idEstacionamiento,
          ESTADOS_COCHERA.INACTIVA,
          id_tipo_vehiculo ?? null,
          ESTADOS_VIGENTES,
          inicio,
          fin,
        ],
      );
      libres = conteo[0].libres;
      if (libres === 0) motivo = 'No quedan cocheras libres en esta franja';
    }

    franjas.push({ ...franja, inicio, fin, disponible: !motivo, cocheras_libres: libres, motivo });
  }

  return { fecha, franjas };
}
