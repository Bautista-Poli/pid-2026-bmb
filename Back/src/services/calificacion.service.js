// Calificacion de una reserva por su conductor (Sprint 3, gamificacion).
// Solo se califica lo que se uso: la reserva tiene que estar FINALIZADA con
// ingreso y egreso registrados por QR, y el egreso no puede tener mas de
// PLAZO_CALIFICACION_DIAS. Una sola calificacion del conductor por reserva
// (tabla `calificacion`, autor CONDUCTOR): `puntaje` queda como el promedio
// redondeado de las cinco categorias, asi la ve tambien quien lee solo puntaje.
import { withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ESTADOS_RESERVA } from '../utils/roles.js';

export const PLAZO_CALIFICACION_DIAS = 7;
const PLAZO_MS = PLAZO_CALIFICACION_DIAS * 86_400_000;

const COLUMNAS = `id_calificacion, id_reserva, id_estacionamiento, puntaje, limpieza, infraestructura,
  atencion, seguridad, acceso, etiquetas, comentario, created_at,
  ROUND(COALESCE((limpieza + infraestructura + atencion + seguridad + acceso) / 5.0, puntaje)::numeric, 1)::float
    AS promedio`;

/** El promedio de las cinco categorias, redondeado: es el `puntaje` de 1 a 5. */
const puntajeGeneral = (d) =>
  Math.round((d.limpieza + d.infraestructura + d.atencion + d.seguridad + d.acceso) / 5);

export async function crear(idReserva, idConductor, datos) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT r.id_reserva, r.id_conductor, r.estado::text AS estado, r.ingreso_real, r.egreso_real,
              c.id_estacionamiento, e.id_propietario
         FROM reserva r
         JOIN cochera c         ON c.id_cochera = r.id_cochera
         JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
        WHERE r.id_reserva = $1
        FOR UPDATE OF r`,
      [idReserva],
    );
    const reserva = rows[0];
    if (!reserva) throw ApiError.notFound('La reserva no existe');
    if (reserva.id_conductor !== idConductor) throw ApiError.forbidden('La reserva es de otro conductor');
    // Con los dos perfiles se puede reservar en el estacionamiento propio: esa
    // reserva no suma a su reputacion.
    if (reserva.id_propietario === idConductor) {
      throw ApiError.forbidden('No podés calificar tu propio estacionamiento');
    }

    const usada =
      reserva.estado === ESTADOS_RESERVA.FINALIZADA && reserva.ingreso_real && reserva.egreso_real;
    if (!usada) {
      throw ApiError.conflict('Solo podes calificar una reserva despues de entrar y salir del estacionamiento');
    }
    if (Date.now() - reserva.egreso_real.getTime() > PLAZO_MS) {
      throw ApiError.conflict(`El plazo para calificar es de ${PLAZO_CALIFICACION_DIAS} dias desde el egreso`);
    }

    const existente = await client.query(
      `SELECT 1 FROM calificacion WHERE id_reserva = $1 AND autor = 'CONDUCTOR'`,
      [idReserva],
    );
    if (existente.rows[0]) throw ApiError.conflict('Ya calificaste esta reserva');

    const { rows: creadas } = await client.query(
      `INSERT INTO calificacion
         (id_reserva, autor, id_conductor, id_estacionamiento, puntaje, limpieza, infraestructura,
          atencion, seguridad, acceso, etiquetas, comentario)
       VALUES ($1, 'CONDUCTOR', $2, $3, $11, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${COLUMNAS}`,
      [
        idReserva,
        idConductor,
        reserva.id_estacionamiento,
        datos.limpieza,
        datos.infraestructura,
        datos.atencion,
        datos.seguridad,
        datos.acceso,
        datos.etiquetas ?? [],
        datos.comentario ?? null,
        puntajeGeneral(datos),
      ],
    );
    return creadas[0];
  });
}

const PLAZO_VENCIDO = `El plazo para calificar es de ${PLAZO_CALIFICACION_DIAS} dias`;

/**
 * El propietario califica al conductor de una reserva de su estacionamiento:
 * FINALIZADA (con ingreso y egreso) o NO_SHOW, una vez y dentro del plazo
 * (desde el egreso, o desde el `fin` si no vino). Sin categorias: solo
 * `puntaje`, etiquetas y comentario (autor PROPIETARIO).
 */
export async function crearDelPropietario(idReserva, idPropietario, datos) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT r.id_reserva, r.id_conductor, r.estado::text AS estado, r.ingreso_real, r.egreso_real, r.fin,
              c.id_estacionamiento, e.id_propietario
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
    // Con los dos perfiles se puede reservar en el estacionamiento propio: esa
    // reserva no suma a la reputacion de nadie.
    if (reserva.id_conductor === idPropietario) {
      throw ApiError.forbidden('No podés calificarte a vos mismo');
    }

    const finalizada =
      reserva.estado === ESTADOS_RESERVA.FINALIZADA && reserva.ingreso_real && reserva.egreso_real;
    const ausente = reserva.estado === ESTADOS_RESERVA.NO_SHOW;
    if (!finalizada && !ausente) {
      throw ApiError.conflict('Solo se califica al conductor de una reserva finalizada o ausente');
    }
    const desde = finalizada ? reserva.egreso_real : reserva.fin;
    if (Date.now() - desde.getTime() > PLAZO_MS) throw ApiError.conflict(PLAZO_VENCIDO);

    try {
      const { rows: creadas } = await client.query(
        `INSERT INTO calificacion
           (id_reserva, autor, id_conductor, id_estacionamiento, puntaje, etiquetas, comentario)
         VALUES ($1, 'PROPIETARIO', $2, $3, $4, $5, $6)
         RETURNING id_calificacion, id_reserva, puntaje, etiquetas, comentario, created_at`,
        [
          idReserva,
          reserva.id_conductor,
          reserva.id_estacionamiento,
          datos.puntaje,
          datos.etiquetas ?? [],
          datos.comentario ?? null,
        ],
      );
      return creadas[0];
    } catch (error) {
      if (error.code === '23505') {
        throw ApiError.conflict('Ya calificaste a este conductor en esta reserva');
      }
      throw error;
    }
  });
}
