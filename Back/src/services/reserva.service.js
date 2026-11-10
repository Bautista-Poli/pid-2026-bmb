// Reservas: crear sin sobreventa, listar, cancelar, el ciclo del propietario
// (confirmar, ausente, ingreso/egreso por codigo), disponibilidad y vencimientos.
import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { normalizarCodigo } from '../utils/codigoAcceso.js';
import {
  FRANJAS_ESTANDAR,
  HORA_LOCAL,
  instanteLocal,
  motivoFueraDeHorario,
  motivoIngresoFueraDeHorario,
  partesLocales,
  sumarDias,
} from '../utils/horario.js';
import { ESTADOS_COCHERA, ESTADOS_RESERVA, ESTADOS_VIGENTES, ORIGENES_CANCELACION } from '../utils/roles.js';
import { cocheraReservable, finEfectivo, sinSolapamiento } from '../utils/solapamiento.js';
import { CAMPOS_TARIFA, HORAS_POR_MODALIDAD, MODALIDADES, precioDeReserva } from '../utils/tarifas.js';
import { buscarCocheraLibre } from './cochera.service.js';
import { validarAbonoParaReservar } from './abono.service.js';
import { PLAZO_CALIFICACION_DIAS } from './calificacion.service.js';
import { lateralReputacionConductor } from './reputacion.service.js';
import { registrarEgresoEnIncidencia } from './incidencia.service.js';
import { aceptaReservas, asegurarPropiedad } from './estacionamiento/estacionamiento.service.js';

const VIOLACION_EXCLUSION = '23P01';

// Un propietario que tambien es conductor no reserva en lo suyo.
export const MENSAJE_PROPIO = 'No podes reservar en un estacionamiento propio';

// Modalidad de las reservas hechas con un abono: no se cobra (ya se pago el
// abono). No esta en MODALIDADES porque el conductor no la elige: sale de `id_abono`.
const MODALIDAD_ABONO = 'ABONO';

// El vehiculo puede llegar hasta 30 minutos antes de su franja.
const MARGEN_INGRESO_MS = 30 * 60 * 1000;

// Una ACTIVA no se cierra sola: mientras el auto no egrese, la cochera queda
// bloqueada (ver finEfectivo en utils/solapamiento.js) y, pasado el margen, se
// abre una incidencia AUTO_EXCEDIDO para el propietario (incidencia.service.js).

// Tolerancia de llegada: una CONFIRMADA sin ingreso a los 15 minutos de su
// `inicio` pasa a NO_SHOW y la cochera vuelve a estar disponible. Desde ese
// momento el codigo ya no registra el ingreso. Mas adelante sera configurable
// por estacionamiento.
export const TOLERANCIA_NO_SHOW_MS = 15 * 60 * 1000;

/** Efecto de una transicion: deja la cochera de la reserva en `estado` (estado fisico). */
const ponerCocheraEn = (estado) => (client, reserva) =>
  client.query('UPDATE cochera SET estado_actual = $1 WHERE id_cochera = $2', [estado, reserva.id_cochera]);

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
      efecto: ponerCocheraEn(ESTADOS_COCHERA.OCUPADA),
    },
    [ESTADOS_RESERVA.CANCELADA]: {},
    // Automatica (vencerAusentes): la cochera nunca paso a OCUPADA, asi
    // que no hay efecto; alcanza con que NO_SHOW no sea un estado vigente.
    [ESTADOS_RESERVA.NO_SHOW]: {},
  },
  [ESTADOS_RESERVA.ACTIVA]: {
    [ESTADOS_RESERVA.FINALIZADA]: {
      efecto: ponerCocheraEn(ESTADOS_COCHERA.LIBRE),
    },
    // No hay ACTIVA -> CANCELADA: una vez que el auto entro, ya no se cancela.
  },
};

/**
 * Mueve `reserva.estado` si la transicion esta permitida; si no, 409. Al
 * cancelar, `canceladaPor` (ORIGENES_CANCELACION) guarda quien lo hizo.
 */
async function cambiarEstado(client, reserva, estadoNuevo, { canceladaPor = null } = {}) {
  const permitido = TRANSICIONES[reserva.estado]?.[estadoNuevo];
  if (!permitido) {
    throw ApiError.conflict(`No se puede pasar de ${reserva.estado} a ${estadoNuevo}`);
  }
  await client.query(
    'UPDATE reserva SET estado = $1, cancelada_por = $2 WHERE id_reserva = $3',
    [estadoNuevo, estadoNuevo === ESTADOS_RESERVA.CANCELADA ? canceladaPor : null, reserva.id_reserva],
  );
  await permitido.efecto?.(client, reserva);
}

/**
 * Lo que ve el propietario del lado de la calificacion del conductor: su
 * reputacion, lo que le puso en esta reserva y si todavia lo puede calificar.
 */
const COLUMNAS_DEL_PROPIETARIO = `,
         rc.promedio AS conductor_promedio, rc.cantidad AS conductor_calificaciones,
         qp.puntaje AS calificacion_al_conductor,
         (qp.puntaje IS NULL AND (
           (r.estado = 'FINALIZADA' AND r.ingreso_real IS NOT NULL AND r.egreso_real IS NOT NULL
             AND r.egreso_real > now() - make_interval(days => ${PLAZO_CALIFICACION_DIAS}))
           OR (r.estado = 'NO_SHOW' AND r.fin > now() - make_interval(days => ${PLAZO_CALIFICACION_DIAS}))
         )) AS conductor_calificable`;

const JOINS_DEL_PROPIETARIO = `${lateralReputacionConductor('r.id_conductor')}
    LEFT JOIN calificacion qp ON qp.id_reserva = r.id_reserva AND qp.autor = 'PROPIETARIO'`;

/**
 * Reserva con todo lo que muestran los listados, con la modalidad y el precio
 * guardados al reservar. El codigo de acceso va solo con `conCodigo`: es del
 * conductor, y el propietario no lo tiene hasta que se lo dan o escanea el QR
 * (la pantalla de acceso, donde ya lo trae, es la unica excepcion).
 *
 * `vista` es quien la pide. Al CONDUCTOR no le va lo que el propietario le
 * puso (ni su reputacion): podria verlo antes de calificar al estacionamiento
 * y responder en consecuencia.
 */
const selectDetalle = ({ conCodigo = false, vista = 'PROPIETARIO' } = {}) => `
  SELECT r.id_reserva, r.id_conductor, r.inicio, r.fin, r.created_at,
         r.ingreso_real, r.egreso_real, r.estado::text AS estado,
         r.cancelada_por::text AS cancelada_por,
         r.id_vehiculo, v.patente, v.marca, v.modelo, v.id_tipo_vehiculo,
         r.id_cochera, c.identificador AS cochera,
         c.sector AS cochera_sector, c.cubierta AS cochera_cubierta,
         e.id_estacionamiento, e.nombre AS estacionamiento, e.direccion,
         r.modalidad, r.precio_total, r.motivo_reasignacion,${conCodigo ? ' r.codigo_acceso,' : ''}
         r.id_abono, a.turno::text AS turno_abono,
         u.nombre AS conductor_nombre, u.apellido AS conductor_apellido,
         (SELECT COALESCE(SUM(d.monto), 0)::float FROM devolucion d
           WHERE d.id_reserva = r.id_reserva) AS devuelto,
         (SELECT i.id_incidencia FROM incidencia i
           WHERE i.id_reserva = r.id_reserva AND i.abierta_por IS NOT NULL
             AND i.estado IN ('ABIERTA', 'DENUNCIADA')
           LIMIT 1) AS reclamo_abierto,
         -- Calificacion: el promedio que dio (null si no califico) y si todavia puede.
         q.promedio AS calificacion_promedio,
         (q.promedio IS NULL AND r.estado = 'FINALIZADA'
           AND r.ingreso_real IS NOT NULL AND r.egreso_real IS NOT NULL
           AND r.egreso_real > now() - make_interval(days => ${PLAZO_CALIFICACION_DIAS})) AS calificable${
           vista === 'PROPIETARIO' ? COLUMNAS_DEL_PROPIETARIO : ''
         }
    FROM reserva r
    JOIN vehiculo v        ON v.id_vehiculo = r.id_vehiculo
    JOIN cochera c         ON c.id_cochera = r.id_cochera
    JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
    JOIN usuario u         ON u.id_usuario = r.id_conductor
    LEFT JOIN abono a      ON a.id_abono = r.id_abono
    LEFT JOIN LATERAL (
      SELECT ROUND(COALESCE(
               (cq.limpieza + cq.infraestructura + cq.atencion + cq.seguridad + cq.acceso) / 5.0, cq.puntaje
             )::numeric, 1)::float AS promedio
        FROM calificacion cq WHERE cq.id_reserva = r.id_reserva AND cq.autor = 'CONDUCTOR'
    ) q ON TRUE
    ${vista === 'PROPIETARIO' ? JOINS_DEL_PROPIETARIO : ''}
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

/**
 * Un vehiculo no puede estar en dos reservas vigentes que se superpongan. Si
 * sigue adentro pasado su `fin` (auto excedido), esa reserva cuenta como sin
 * fin (finEfectivo): el EXCLUDE de la base usa `fin` y no lo ve.
 */
async function asegurarVehiculoLibre(client, idVehiculo, inicio, fin) {
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
async function bloquearCochera(client, idCochera, vehiculo, inicio, fin, { conAbono = false } = {}) {
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
async function asignarCochera(client, idEstacionamiento, vehiculo, inicio, fin, { conAbono = false } = {}) {
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
async function obtenerDetalle(ejecutor, idReserva, { conCodigo = false, vista } = {}) {
  const { rows } = await ejecutor.query(`${selectDetalle({ conCodigo, vista })} WHERE r.id_reserva = $1`, [
    idReserva,
  ]);
  return rows[0];
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

/* -------------------------- ciclo de la reserva ---------------------------
   El propietario la confirma, despues registra el ingreso del vehiculo y por
   ultimo el egreso, que la finaliza y libera la cochera. El ingreso y el
   egreso solo se registran con el codigo de la reserva (registrarAcceso):

     PENDIENTE -> CONFIRMADA -> (ingreso) ACTIVA -> (egreso) FINALIZADA

   Ademas hay dos transiciones automaticas (src/jobs/vencimientos.job.js):
   una PENDIENTE que nunca se confirmo se cancela sola al empezar su franja, y
   una CONFIRMADA sin ingreso pasa a NO_SHOW a los TOLERANCIA_NO_SHOW_MS de
   `inicio` (y libera la cochera). Una ACTIVA sin egreso registrado, en cambio,
   no se cierra sola: la cochera queda bloqueada hasta el egreso y se abre una
   incidencia (incidencia.service.js). Todas las transiciones, manuales y
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
    // Sin confirmar al empezar ya es Expirada, aunque la revision de vencimientos no la haya cancelado.
    if (reserva.estado === ESTADOS_RESERVA.PENDIENTE && reserva.inicio <= new Date()) {
      throw ApiError.conflict('La reserva empezo sin confirmar: quedo expirada');
    }

    await cambiarEstado(client, reserva, ESTADOS_RESERVA.CONFIRMADA);

    return obtenerDetalle(client, idReserva);
  });
}

/**
 * El propietario marca a mano que el conductor no va a venir (p. ej. avisó),
 * sin esperar a que venza la tolerancia. Solo sobre una CONFIRMADA sin
 * ingreso y desde su `inicio`: antes todavía puede llegar, y si no viene lo
 * que corresponde es que el conductor cancele. Libera la cochera igual que el
 * no-show automatico.
 */
export async function marcarAusente(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);

    if (reserva.estado !== ESTADOS_RESERVA.CONFIRMADA) {
      throw ApiError.conflict('Solo se marca ausente una reserva confirmada sin ingreso');
    }
    if (Date.now() < reserva.inicio.getTime()) {
      throw ApiError.conflict(
        `La reserva empieza a las ${HORA_LOCAL.format(reserva.inicio)}; recien desde entonces se puede marcar ausente`,
      );
    }

    await cambiarEstado(client, reserva, ESTADOS_RESERVA.NO_SHOW);
    return obtenerDetalle(client, idReserva);
  });
}

/**
 * Un egreso pegado al ingreso es casi seguro un doble escaneo del QR (o una
 * recarga de la pantalla), no un auto que entro y salio: se rechaza.
 */
const MARGEN_EGRESO_TRAS_INGRESO_MS = 60 * 1000;

const MENSAJE_TOLERANCIA = 'Paso la tolerancia de ingreso: la reserva quedo como ausente';
const MENSAJE_NO_SHOW = 'La reserva quedo como ausente: el vehiculo no llego a tiempo';

/** Ultimo instante (ms) en que se acepta el ingreso: `inicio` + tolerancia, sin pasar de `fin`. */
function limiteIngreso(reserva) {
  return Math.min(reserva.inicio.getTime() + TOLERANCIA_NO_SHOW_MS, reserva.fin.getTime());
}

/** Reglas del ingreso sobre una reserva ya bloqueada (las usa registrarAcceso). */
async function aplicarIngreso(client, reserva) {
  if (reserva.estado === ESTADOS_RESERVA.PENDIENTE) {
    throw ApiError.conflict('Primero hay que confirmar la reserva');
  }
  if (reserva.ingreso_real) throw ApiError.conflict('El ingreso ya estaba registrado');

  const ahora = Date.now();
  if (ahora < reserva.inicio.getTime() - MARGEN_INGRESO_MS) {
    throw ApiError.conflict('Todavia es muy temprano para registrar el ingreso');
  }
  if (ahora > reserva.fin.getTime()) throw ApiError.conflict('La franja de la reserva ya termino');
  // Mismo corte que la revision de vencimientos: pasada la tolerancia la reserva
  // es un no-show, aunque todavia no la haya marcado (corre al llegar pedidos).
  if (ahora > limiteIngreso(reserva)) throw ApiError.conflict(MENSAJE_TOLERANCIA);

  // Un auto excedido sigue en la cochera: no entra otro hasta su egreso.
  const { rows: ocupada } = await client.query(
    `SELECT 1 FROM reserva WHERE id_cochera = $1 AND estado = $2 AND id_reserva <> $3 LIMIT 1`,
    [reserva.id_cochera, ESTADOS_RESERVA.ACTIVA, reserva.id_reserva],
  );
  if (ocupada[0]) {
    throw ApiError.conflict('La cochera sigue ocupada por el vehiculo anterior: espera su egreso');
  }

  await client.query('UPDATE reserva SET ingreso_real = now() WHERE id_reserva = $1', [reserva.id_reserva]);
  await cambiarEstado(client, reserva, ESTADOS_RESERVA.ACTIVA);
}

/** Reglas del egreso sobre una reserva ya bloqueada (las usa registrarAcceso). */
async function aplicarEgreso(client, reserva) {
  if (!reserva.ingreso_real) throw ApiError.conflict('La reserva todavia no tiene ingreso');
  if (reserva.egreso_real) throw ApiError.conflict('El egreso ya estaba registrado');

  await client.query('UPDATE reserva SET egreso_real = now() WHERE id_reserva = $1', [reserva.id_reserva]);
  await cambiarEstado(client, reserva, ESTADOS_RESERVA.FINALIZADA);
  // Si se habia excedido, queda constancia en su incidencia.
  await registrarEgresoEnIncidencia(client, reserva.id_reserva);
}

/* ----------------------- ingreso y egreso por codigo -----------------------
   El conductor muestra el QR de su reserva al entrar y al salir; el operador
   (hoy, el propietario) lo escanea o tipea el codigo. El mismo codigo sirve
   para las dos cosas: el estado de la reserva decide que se registra.
-------------------------------------------------------------------------- */

const ACCIONES_ACCESO = Object.freeze({ INGRESO: 'INGRESO', EGRESO: 'EGRESO' });

/** Mismo mensaje para un codigo inexistente, mal formado o de un estacionamiento ajeno. */
const CODIGO_INVALIDO = 'El codigo no corresponde a ninguna reserva de tus estacionamientos';

/** La reserva de ese codigo en un estacionamiento del propietario; 404 si no. */
async function buscarReservaPorCodigo(ejecutor, idPropietario, bruto, { bloquear = false } = {}) {
  const codigo = normalizarCodigo(bruto);
  if (!codigo) throw ApiError.notFound(CODIGO_INVALIDO);

  const { rows } = await ejecutor.query(
    `SELECT r.id_reserva, r.estado, r.inicio, r.fin, r.ingreso_real, r.egreso_real, r.id_cochera
       FROM reserva r
       JOIN cochera c         ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE r.codigo_acceso = $1 AND e.id_propietario = $2
      ${bloquear ? 'FOR UPDATE OF r' : ''}`,
    [codigo, idPropietario],
  );
  if (!rows[0]) throw ApiError.notFound(CODIGO_INVALIDO);
  return rows[0];
}

/**
 * Que se registra ahora sobre esta reserva. Una ACTIVA da egreso aunque su
 * `fin` haya pasado (el auto sigue adentro); el resto explica por que no.
 */
function accionPara(reserva, ahora = Date.now()) {
  switch (reserva.estado) {
    case ESTADOS_RESERVA.ACTIVA:
      return ACCIONES_ACCESO.EGRESO;
    case ESTADOS_RESERVA.CONFIRMADA: {
      const desde = new Date(reserva.inicio.getTime() - MARGEN_INGRESO_MS);
      if (ahora < desde.getTime()) {
        throw ApiError.conflict(
          `La reserva empieza a las ${HORA_LOCAL.format(reserva.inicio)}; ` +
            `se puede ingresar desde las ${HORA_LOCAL.format(desde)}`,
        );
      }
      if (ahora > reserva.fin.getTime()) throw ApiError.conflict('La franja de la reserva ya termino');
      if (ahora > limiteIngreso(reserva)) throw ApiError.conflict(MENSAJE_TOLERANCIA);
      return ACCIONES_ACCESO.INGRESO;
    }
    case ESTADOS_RESERVA.PENDIENTE:
      throw ApiError.conflict('La reserva todavia no esta confirmada');
    case ESTADOS_RESERVA.CANCELADA:
      throw ApiError.conflict('La reserva esta cancelada');
    case ESTADOS_RESERVA.NO_SHOW:
      throw ApiError.conflict(MENSAJE_NO_SHOW);
    default:
      throw ApiError.conflict('La reserva ya termino');
  }
}

/** Vista previa para la pantalla de confirmacion del operador: no registra nada. */
export async function previaAcceso(idPropietario, codigo) {
  const reserva = await buscarReservaPorCodigo({ query }, idPropietario, codigo);
  const accion = accionPara(reserva);
  return { accion, reserva: await obtenerDetalle({ query }, reserva.id_reserva, { conCodigo: true }) };
}

/**
 * Registra el ingreso o el egreso. Vuelve a resolver la accion con la reserva
 * bloqueada: entre la vista previa y la confirmacion puede haber cambiado.
 */
export async function registrarAcceso(idPropietario, { codigo }) {
  return withTransaction(async (client) => {
    const reserva = await buscarReservaPorCodigo(client, idPropietario, codigo, { bloquear: true });
    const accion = accionPara(reserva);

    if (accion === ACCIONES_ACCESO.INGRESO) {
      await aplicarIngreso(client, reserva);
    } else {
      if (Date.now() - reserva.ingreso_real.getTime() < MARGEN_EGRESO_TRAS_INGRESO_MS) {
        throw ApiError.conflict('Acabas de registrar el ingreso; el egreso se marca cuando el auto se va');
      }
      await aplicarEgreso(client, reserva);
    }

    return { accion, reserva: await obtenerDetalle(client, reserva.id_reserva, { conCodigo: true }) };
  });
}

/**
 * Franjas del dia con la cantidad de cocheras libres. `motivo` explica por
 * que una franja no se puede reservar (fuera de horario, ya empezo o sin cochera libre)
 * y `causa` lo resume: HORARIO, PASADO o SIN_COCHERA.
 *
 * Con `modalidad` y/o `horas` cada franja es un ingreso posible: una por cada
 * hora del dia, de `horas` de largo (12 y 24 en estadia y jornada).
 */
export async function disponibilidad(idEstacionamiento, { fecha, id_tipo_vehiculo, modalidad, horas, con_abono = false }) {
  const { rows } = await query(
    'SELECT publicado, activo, estado_aprobacion FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');
  if (!aceptaReservas(rows[0], { conAbono: con_abono })) {
    throw ApiError.conflict('El estacionamiento no esta disponible para reservar');
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
            AND ${cocheraReservable()}
            AND ($2::smallint IS NULL OR c.id_tipo_vehiculo = $2)
            AND ${sinSolapamiento('$3', '$4', '$5')}`,
        [idEstacionamiento, id_tipo_vehiculo ?? null, ESTADOS_VIGENTES, inicio, fin],
      );
      libres = conteo[0].libres;
      if (libres === 0) {
        motivo = 'No quedan cocheras libres en esta franja';
        causa = 'SIN_COCHERA';
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
                AND ${cocheraReservable()}
                AND ($2::smallint IS NULL OR c.id_tipo_vehiculo = $2)
                AND ${sinSolapamiento('$3', 'i.inicio', 'i.inicio + make_interval(hours => $5::int)')}
            ) AS libres
       FROM generate_series($4::timestamptz, $4::timestamptz + interval '23 hours', interval '1 hour')
            AS i(inicio)
      ORDER BY i.inicio`,
    [idEstacionamiento, id_tipo_vehiculo ?? null, ESTADOS_VIGENTES, primero, horas],
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
      causa = 'SIN_COCHERA';
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
 * Vencimientos automaticos: los llama src/jobs/vencimientos.job.js al llegar pedidos.
 * Cada reserva vencida se procesa en su propia transaccion con FOR UPDATE,
 * igual que las acciones manuales, asi una revision nunca pisa una
 * confirmacion/ingreso/egreso que este pasando al mismo tiempo.
 */

/**
 * Procesa cada reserva vencida en su propia transaccion: `procesar(client, id)`
 * la vuelve a buscar con FOR UPDATE (pudo cambiar desde la consulta) y devuelve
 * true si la movio. Devuelve cuantas se movieron.
 */
async function procesarVencidas(ids, procesar) {
  let movidas = 0;
  for (const id of ids) {
    if (await withTransaction((client) => procesar(client, id))) movidas += 1;
  }
  return movidas;
}

/** PENDIENTE que nunca se confirmo y ya empezo su franja: se cancela. */
export async function vencerPendientesSinConfirmar() {
  const { rows } = await query(
    `SELECT id_reserva FROM reserva WHERE estado = $1 AND inicio <= now()`,
    [ESTADOS_RESERVA.PENDIENTE],
  );

  return procesarVencidas(rows.map((r) => r.id_reserva), async (client, id) => {
    const { rows: filas } = await client.query(
      `SELECT id_reserva, estado FROM reserva WHERE id_reserva = $1 AND estado = $2 FOR UPDATE`,
      [id, ESTADOS_RESERVA.PENDIENTE],
    );
    if (!filas[0]) return false;
    await cambiarEstado(client, filas[0], ESTADOS_RESERVA.CANCELADA, {
      canceladaPor: ORIGENES_CANCELACION.SISTEMA,
    });
    return true;
  });
}

/**
 * CONFIRMADA sin ingreso, pasada la tolerancia desde `inicio` (o ya terminada,
 * si la franja es mas corta que la tolerancia): pasa a NO_SHOW. Como NO_SHOW
 * no es un estado vigente, la cochera queda disponible en el acto para la
 * disponibilidad, la busqueda y las reservas nuevas.
 */
export async function vencerAusentes() {
  const { rows } = await query(
    `SELECT id_reserva FROM reserva
      WHERE estado = $1 AND ingreso_real IS NULL
        AND LEAST(inicio + make_interval(secs => $2::float / 1000), fin) < now()`,
    [ESTADOS_RESERVA.CONFIRMADA, TOLERANCIA_NO_SHOW_MS],
  );

  return procesarVencidas(rows.map((r) => r.id_reserva), async (client, id) => {
    const { rows: filas } = await client.query(
      `SELECT id_reserva, estado FROM reserva
        WHERE id_reserva = $1 AND estado = $2 AND ingreso_real IS NULL
        FOR UPDATE`,
      [id, ESTADOS_RESERVA.CONFIRMADA],
    );
    if (!filas[0]) return false;
    await cambiarEstado(client, filas[0], ESTADOS_RESERVA.NO_SHOW);
    return true;
  });
}
