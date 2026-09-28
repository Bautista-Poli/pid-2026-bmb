import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import {
  FRANJAS_ESTANDAR,
  instanteLocal,
  motivoFueraDeHorario,
  motivoIngresoFueraDeHorario,
  partesLocales,
  sumarDias,
} from '../utils/horario.js';
import { ESTADOS_COCHERA, ESTADOS_RESERVA, ESTADOS_VIGENTES } from '../utils/roles.js';
import { sinSolapamiento } from '../utils/solapamiento.js';
import { CAMPOS_TARIFA, HORAS_POR_MODALIDAD, MODALIDADES, precioDeReserva } from '../utils/tarifas.js';
import { ORDEN_NATURAL } from './cochera.service.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_EXCLUSION = '23P01';

// El vehiculo puede llegar hasta 30 minutos antes de su franja.
const MARGEN_INGRESO_MS = 30 * 60 * 1000;

// Vencimientos automaticos (job de src/jobs/vencimientos.job.js): una
// PENDIENTE sin confirmar se cancela apenas empieza su franja, y una ACTIVA
// sin egreso registrado se cierra sola pasado este margen desde `fin`.
export const MARGEN_CIERRE_AUTOMATICO_MS = 30 * 60 * 1000;

/**
 * Transiciones de estado permitidas: TRANSICIONES[desde][hacia]. Si la
 * combinacion no esta, cambiarEstado() la rechaza. `efecto` corre, dentro de
 * la misma transaccion, lo que tenga que pasar ademas de mover `estado`
 * (hoy, solo el estado_actual de la cochera).
 */
const TRANSICIONES = {
  [ESTADOS_RESERVA.PENDIENTE]: {
    [ESTADOS_RESERVA.CONFIRMADA]: {},
    [ESTADOS_RESERVA.CANCELADA]: {},
  },
  [ESTADOS_RESERVA.CONFIRMADA]: {
    [ESTADOS_RESERVA.ACTIVA]: {
      efecto: (client, reserva) =>
        client.query('UPDATE cochera SET estado_actual = $1 WHERE id_cochera = $2', [
          ESTADOS_COCHERA.OCUPADA,
          reserva.id_cochera,
        ]),
    },
    [ESTADOS_RESERVA.CANCELADA]: {},
  },
  [ESTADOS_RESERVA.ACTIVA]: {
    [ESTADOS_RESERVA.FINALIZADA]: {
      efecto: (client, reserva) =>
        client.query('UPDATE cochera SET estado_actual = $1 WHERE id_cochera = $2', [
          ESTADOS_COCHERA.LIBRE,
          reserva.id_cochera,
        ]),
    },
    // No hay ACTIVA -> CANCELADA: una vez que el auto entro, ya no se cancela.
  },
};

/** Mueve `reserva.estado` si la transicion esta permitida; si no, 409. */
async function cambiarEstado(client, reserva, estadoNuevo) {
  const permitido = TRANSICIONES[reserva.estado]?.[estadoNuevo];
  if (!permitido) {
    throw ApiError.conflict(`No se puede pasar de ${reserva.estado} a ${estadoNuevo}`);
  }
  await client.query('UPDATE reserva SET estado = $1 WHERE id_reserva = $2', [
    estadoNuevo,
    reserva.id_reserva,
  ]);
  await permitido.efecto?.(client, reserva);
}

/** Reserva con todo lo que muestran los listados, con la modalidad y el precio guardados al reservar. */
const SELECT_DETALLE = `
  SELECT r.id_reserva, r.id_conductor, r.inicio, r.fin, r.created_at,
         r.ingreso_real, r.egreso_real, r.estado::text AS estado,
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
    if (!ESTADOS_VIGENTES.includes(reserva.estado)) {
      throw ApiError.conflict(`La reserva ya esta ${reserva.estado.toLowerCase()}`);
    }
    if (reserva.fin <= new Date()) {
      throw ApiError.conflict('La reserva ya termino');
    }
    if (reserva.estado === ESTADOS_RESERVA.CONFIRMADA && reserva.politica_cancelacion_horas != null) {
      const margenMs = reserva.politica_cancelacion_horas * 60 * 60 * 1000;
      if (reserva.inicio.getTime() - Date.now() < margenMs) {
        throw ApiError.conflict(
          `Este estacionamiento exige cancelar con ${reserva.politica_cancelacion_horas} hora(s) de anticipacion`,
        );
      }
    }

    await cambiarEstado(client, reserva, ESTADOS_RESERVA.CANCELADA);

    return obtenerDetalle(client, idReserva);
  });
}

/* -------------------------- ciclo de la reserva ---------------------------
   El propietario la confirma, despues registra el ingreso del vehiculo y por
   ultimo el egreso, que la finaliza y libera la cochera:

     PENDIENTE -> CONFIRMADA -> (ingreso) ACTIVA -> (egreso) FINALIZADA

   Ademas hay dos transiciones automaticas (src/jobs/vencimientos.job.js):
   una PENDIENTE que nunca se confirmo se cancela sola al empezar su franja,
   y una ACTIVA sin egreso registrado se cierra sola a los
   MARGEN_CIERRE_AUTOMATICO_MS de `fin`. Todas las transiciones, manuales y
   automaticas, pasan por cambiarEstado() / TRANSICIONES arriba.
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

    if (reserva.fin <= new Date()) throw ApiError.conflict('La reserva ya termino');

    await cambiarEstado(client, reserva, ESTADOS_RESERVA.CONFIRMADA);

    return obtenerDetalle(client, idReserva);
  });
}

/** Llego el vehiculo: se guarda la hora y la cochera pasa a OCUPADA. */
export async function registrarIngreso(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);

    if (reserva.estado === ESTADOS_RESERVA.PENDIENTE) {
      throw ApiError.conflict('Primero hay que confirmar la reserva');
    }
    if (reserva.ingreso_real) throw ApiError.conflict('El ingreso ya estaba registrado');

    const ahora = Date.now();
    if (ahora < reserva.inicio.getTime() - MARGEN_INGRESO_MS) {
      throw ApiError.conflict('Todavia es muy temprano para registrar el ingreso');
    }
    if (ahora > reserva.fin.getTime()) throw ApiError.conflict('La franja de la reserva ya termino');

    await client.query('UPDATE reserva SET ingreso_real = now() WHERE id_reserva = $1', [idReserva]);
    await cambiarEstado(client, reserva, ESTADOS_RESERVA.ACTIVA);

    return obtenerDetalle(client, idReserva);
  });
}

/** Se fue el vehiculo: la reserva queda FINALIZADA y la cochera libre. */
export async function registrarEgreso(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);

    if (!reserva.ingreso_real) throw ApiError.conflict('La reserva todavia no tiene ingreso');
    if (reserva.egreso_real) throw ApiError.conflict('El egreso ya estaba registrado');

    await client.query('UPDATE reserva SET egreso_real = now() WHERE id_reserva = $1', [idReserva]);
    await cambiarEstado(client, reserva, ESTADOS_RESERVA.FINALIZADA);

    return obtenerDetalle(client, idReserva);
  });
}

/**
 * Franjas del dia con la cantidad de cocheras libres. `motivo` explica por
 * que una franja no se puede reservar (fuera de horario, ya empezo o sin lugar)
 * y `causa` lo resume: HORARIO, PASADO o SIN_LUGAR.
 *
 * Con `modalidad` y/o `horas` cada franja es un ingreso posible: una por cada
 * hora del dia, de `horas` de largo (12 y 24 en estadia y jornada).
 */
export async function disponibilidad(idEstacionamiento, { fecha, id_tipo_vehiculo, modalidad, horas }) {
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

  if (modalidad || horas) {
    const bloque = HORAS_POR_MODALIDAD[modalidad];
    return {
      fecha,
      franjas: await ingresosDelDia(idEstacionamiento, horarios, {
        fecha,
        id_tipo_vehiculo,
        horas: bloque ?? horas,
        porBloque: bloque !== undefined,
      }),
    };
  }

  const franjas = [];
  for (const franja of FRANJAS_ESTANDAR) {
    const inicio = instanteLocal(fecha, franja.hora_desde);
    const fin = instanteLocal(fecha, franja.hora_hasta);

    let motivo = motivoFueraDeHorario(horarios, inicio, fin);
    let causa = motivo ? 'HORARIO' : null;
    // Mismo margen que el validador de reservas: no se reserva lo que ya empezo.
    if (!motivo && inicio.getTime() < Date.now() - 60_000) {
      motivo = 'La franja ya empezo';
      causa = 'PASADO';
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
      if (libres === 0) {
        motivo = 'No quedan cocheras libres en esta franja';
        causa = 'SIN_LUGAR';
      }
    }

    franjas.push({ ...franja, inicio, fin, disponible: !motivo, cocheras_libres: libres, motivo, causa });
  }

  return { fecha, franjas };
}

/**
 * Un ingreso por cada hora del dia (00:00 a 23:00), de `horas` de largo, con
 * las cocheras libres en todo ese rango. Se cuentan en una sola consulta.
 * Por hora el rango entero tiene que caer en el horario de atencion; por
 * bloque (estadia, jornada) alcanza con entrar abierto, igual que al reservar.
 */
async function ingresosDelDia(idEstacionamiento, horarios, { fecha, id_tipo_vehiculo, horas, porBloque }) {
  const primero = instanteLocal(fecha, '00:00');
  const { rows } = await query(
    `SELECT i.inicio,
            (SELECT COUNT(*)::int
               FROM cochera c
              WHERE c.id_estacionamiento = $1
                AND c.activo
                AND c.estado_actual <> $2
                AND ($3::smallint IS NULL OR c.id_tipo_vehiculo = $3)
                AND ${sinSolapamiento('$4', 'i.inicio', 'i.inicio + make_interval(hours => $6::int)')}
            ) AS libres
       FROM generate_series($5::timestamptz, $5::timestamptz + interval '23 hours', interval '1 hour')
            AS i(inicio)
      ORDER BY i.inicio`,
    [idEstacionamiento, ESTADOS_COCHERA.INACTIVA, id_tipo_vehiculo ?? null, ESTADOS_VIGENTES, primero, horas],
  );

  return rows.map(({ inicio, libres }) => {
    const fin = new Date(inicio.getTime() + horas * 3_600_000);
    let motivo = porBloque
      ? motivoIngresoFueraDeHorario(horarios, inicio)
      : motivoFueraDeHorario(horarios, inicio, fin);
    let causa = motivo ? 'HORARIO' : null;
    if (!motivo && inicio.getTime() < Date.now() - 60_000) {
      motivo = 'Ese horario ya empezo';
      causa = 'PASADO';
    }
    if (!motivo && libres === 0) {
      motivo = 'No quedan cocheras libres en ese horario';
      causa = 'SIN_LUGAR';
    }
    const hasta = partesLocales(fin);
    return {
      hora_desde: partesLocales(inicio).hora,
      hora_hasta: hasta.hora,
      fecha_hasta: hasta.fecha,
      inicio,
      fin,
      disponible: !motivo,
      cocheras_libres: motivo ? 0 : libres,
      motivo,
      causa,
    };
  });
}

/*
 * Vencimientos automaticos: los llama src/jobs/vencimientos.job.js cada tanto.
 * Cada reserva vencida se procesa en su propia transaccion con FOR UPDATE,
 * igual que las acciones manuales, asi una corrida del job nunca pisa una
 * confirmacion/ingreso/egreso que este pasando al mismo tiempo.
 */

/** PENDIENTE que nunca se confirmo y ya empezo su franja: se cancela. */
export async function vencerPendientesSinConfirmar() {
  const { rows } = await query(
    `SELECT id_reserva FROM reserva WHERE estado = $1 AND inicio <= now()`,
    [ESTADOS_RESERVA.PENDIENTE],
  );

  let canceladas = 0;
  for (const { id_reserva } of rows) {
    const proceso = await withTransaction(async (client) => {
      const { rows: filas } = await client.query(
        `SELECT id_reserva, estado FROM reserva WHERE id_reserva = $1 AND estado = $2 FOR UPDATE`,
        [id_reserva, ESTADOS_RESERVA.PENDIENTE],
      );
      if (!filas[0]) return false;
      await cambiarEstado(client, filas[0], ESTADOS_RESERVA.CANCELADA);
      return true;
    });
    if (proceso) canceladas += 1;
  }
  return canceladas;
}

/** ACTIVA sin egreso registrado, vencida hace mas de MARGEN_CIERRE_AUTOMATICO_MS: se finaliza sola. */
export async function vencerActivasSinEgreso() {
  const { rows } = await query(
    `SELECT id_reserva FROM reserva
      WHERE estado = $1 AND fin <= now() - make_interval(secs => $2::float / 1000)`,
    [ESTADOS_RESERVA.ACTIVA, MARGEN_CIERRE_AUTOMATICO_MS],
  );

  let finalizadas = 0;
  for (const { id_reserva } of rows) {
    const proceso = await withTransaction(async (client) => {
      const { rows: filas } = await client.query(
        `SELECT id_reserva, id_cochera, estado FROM reserva WHERE id_reserva = $1 AND estado = $2 FOR UPDATE`,
        [id_reserva, ESTADOS_RESERVA.ACTIVA],
      );
      if (!filas[0]) return false;
      await client.query('UPDATE reserva SET egreso_real = now() WHERE id_reserva = $1', [id_reserva]);
      await cambiarEstado(client, filas[0], ESTADOS_RESERVA.FINALIZADA);
      return true;
    });
    if (proceso) finalizadas += 1;
  }
  return finalizadas;
}
