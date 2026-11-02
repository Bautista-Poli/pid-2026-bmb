import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { AUTORES_CALIFICACION, limiteCalificacionSql } from '../utils/reputacion.js';
import { ESTADOS_RESERVA, ROLES } from '../utils/roles.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_UNIQUE = '23505';

/** Estados que puede calificar cada lado: un Ausente solo lo califica el propietario. */
const CALIFICABLES = {
  [AUTORES_CALIFICACION.CONDUCTOR]: [ESTADOS_RESERVA.FINALIZADA],
  [AUTORES_CALIFICACION.PROPIETARIO]: [ESTADOS_RESERVA.FINALIZADA, ESTADOS_RESERVA.NO_SHOW],
};

const MENSAJE_YA_CALIFICO = 'Ya calificaste esta reserva';

/**
 * Califica la otra parte de una reserva terminada. El autor sale del perfil
 * activo: con CONDUCTOR, la reserva tiene que ser suya y se califica el
 * estacionamiento; con PROPIETARIO, el estacionamiento tiene que ser suyo y se
 * califica al conductor. Una reserva ajena no existe (404).
 */
export async function calificar(idReserva, usuario, { puntaje, comentario }) {
  const autor =
    usuario.rol === ROLES.PROPIETARIO ? AUTORES_CALIFICACION.PROPIETARIO : AUTORES_CALIFICACION.CONDUCTOR;

  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT r.id_reserva, r.id_conductor, r.estado::text AS estado, e.id_estacionamiento, e.id_propietario,
                now() > ${limiteCalificacionSql('r')} AS vencida
           FROM reserva r
           JOIN cochera c         ON c.id_cochera = r.id_cochera
           JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
          WHERE r.id_reserva = $1
            FOR UPDATE OF r`,
        [idReserva],
      );
      const reserva = rows[0];
      const esSuya =
        reserva &&
        (autor === AUTORES_CALIFICACION.CONDUCTOR
          ? reserva.id_conductor === usuario.id
          : reserva.id_propietario === usuario.id);
      if (!esSuya) throw ApiError.notFound('Reserva no encontrada');

      if (!CALIFICABLES[autor].includes(reserva.estado)) {
        throw ApiError.conflict('Esta reserva no se puede calificar');
      }
      if (reserva.vencida) throw ApiError.conflict('Paso el plazo para calificar');

      const insertada = await client.query(
        `INSERT INTO calificacion (id_reserva, autor, id_estacionamiento, id_conductor, puntaje, comentario)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id_reserva, autor) DO NOTHING
         RETURNING id_calificacion, autor::text AS autor, puntaje, comentario, created_at`,
        [reserva.id_reserva, autor, reserva.id_estacionamiento, reserva.id_conductor, puntaje, comentario],
      );
      if (insertada.rowCount === 0) throw ApiError.conflict(MENSAJE_YA_CALIFICO);
      return insertada.rows[0];
    });
  } catch (error) {
    if (error.code === VIOLACION_UNIQUE) throw ApiError.conflict(MENSAJE_YA_CALIFICO);
    throw error;
  }
}

/**
 * Lo que recibio alguien: resumen (promedio de un decimal y cantidad) y la
 * pagina de calificaciones, sin autor ni reserva. Los comentarios solo los ve
 * quien los recibe.
 */
async function recibidas(columna, id, autor, { limit, offset }) {
  const [resumen, pagina] = await Promise.all([
    query(
      `SELECT ROUND(AVG(puntaje), 1)::float AS promedio, COUNT(*)::int AS cantidad
         FROM calificacion WHERE ${columna} = $1 AND autor = $2`,
      [id, autor],
    ),
    query(
      `SELECT puntaje, comentario, created_at
         FROM calificacion WHERE ${columna} = $1 AND autor = $2
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4`,
      [id, autor, limit, offset],
    ),
  ]);
  return { resumen: resumen.rows[0], calificaciones: pagina.rows };
}

/** Lo que los propietarios le pusieron al conductor. */
export function recibidasPorConductor(idConductor, paginado) {
  return recibidas('id_conductor', idConductor, AUTORES_CALIFICACION.PROPIETARIO, paginado);
}

/** Lo que los conductores le pusieron al estacionamiento; solo lo ve su dueno. */
export async function recibidasPorEstacionamiento(idEstacionamiento, idPropietario, paginado) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);
  return recibidas('id_estacionamiento', idEstacionamiento, AUTORES_CALIFICACION.CONDUCTOR, paginado);
}
