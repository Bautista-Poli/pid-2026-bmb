// Reputacion del conductor: lo que le pusieron los propietarios al calificarlo
// (promedio, etiquetas mas marcadas y las reseñas que ya puede ver).
import { query } from '../../config/database.js';
import { PLAZO_CALIFICACION_DIAS } from '../calificacion.service.js';

/**
 * `LEFT JOIN LATERAL ... AS rc` con lo que le pusieron los propietarios al
 * conductor `idConductor` (expresion SQL), de toda su historia: `rc.promedio`
 * (null sin calificaciones) y `rc.cantidad`, en una sola pasada.
 */
export const lateralReputacionConductor = (idConductor) => `
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(qc.puntaje)::numeric, 1)::float AS promedio, COUNT(*)::int AS cantidad
      FROM calificacion qc
     WHERE qc.id_conductor = ${idConductor} AND qc.autor = 'PROPIETARIO' AND NOT qc.oculta
  ) rc ON TRUE`;

/**
 * Reseñas que el conductor ya puede ver: las de reservas que el califico, o
 * cuyo plazo para calificar vencio. Antes no, para que no vea la nota del
 * propietario y responda en consecuencia al calificar el estacionamiento.
 */
export const RESENA_VISIBLE_PARA_EL_CONDUCTOR = `(
  EXISTS (SELECT 1 FROM calificacion qq WHERE qq.id_reserva = r.id_reserva AND qq.autor = 'CONDUCTOR')
  OR (r.estado = 'FINALIZADA' AND r.egreso_real <= now() - make_interval(days => ${PLAZO_CALIFICACION_DIAS}))
  OR (r.estado = 'NO_SHOW' AND r.fin <= now() - make_interval(days => ${PLAZO_CALIFICACION_DIAS}))
)`;

/**
 * Promedio, cantidad y las 3 etiquetas mas marcadas por los propietarios, y
 * las ultimas 20 reseñas que ya puede ver (ver RESENA_VISIBLE_PARA_EL_CONDUCTOR).
 */
export async function reputacionDelConductor(idConductor) {
  const [{ rows: resumen }, { rows: etiquetas }, { rows: resenas }] = await Promise.all([
    query(`SELECT rc.promedio, rc.cantidad FROM (SELECT 1) x ${lateralReputacionConductor('$1')}`, [idConductor]),
    query(
      `SELECT etiqueta AS codigo, COUNT(*)::int AS cantidad
         FROM calificacion qc, unnest(qc.etiquetas) AS etiqueta
        WHERE qc.id_conductor = $1 AND qc.autor = 'PROPIETARIO' AND NOT qc.oculta
        GROUP BY etiqueta
        ORDER BY cantidad DESC, etiqueta
        LIMIT 3`,
      [idConductor],
    ),
    query(
      `SELECT qc.id_calificacion, qc.puntaje, qc.etiquetas, qc.comentario, qc.created_at,
              e.nombre AS estacionamiento, qc.denuncia_estado::text AS denuncia_estado
         FROM calificacion qc
         JOIN reserva r         ON r.id_reserva = qc.id_reserva
         JOIN estacionamiento e ON e.id_estacionamiento = qc.id_estacionamiento
        WHERE qc.id_conductor = $1 AND qc.autor = 'PROPIETARIO' AND NOT qc.oculta
          AND ${RESENA_VISIBLE_PARA_EL_CONDUCTOR}
        ORDER BY qc.created_at DESC
        LIMIT 20`,
      [idConductor],
    ),
  ]);
  return {
    promedio: resumen[0].promedio,
    cantidad: resumen[0].cantidad,
    etiquetas,
    resenas,
  };
}
