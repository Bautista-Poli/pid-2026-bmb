// Piezas de SQL para calcular la reputacion de un estacionamiento dentro de
// otras consultas: la usan la busqueda, el detalle, "mis estacionamientos" y la
// pantalla de reputacion del propietario (reputacion.service.js).
import {
  CATEGORIAS,
  MINIMO_CALIFICACIONES,
  NIVELES,
  UMBRAL_DESTACADO,
  insigniasDe,
  nivelDe,
  redondear,
} from './reputacion-reglas.js';

/**
 * Nota general de una calificacion: el promedio de las cinco categorias si las
 * tiene, o su `puntaje` (las que se cargan sin detalle). Solo cuentan las del
 * CONDUCTOR: las del PROPIETARIO califican al conductor, no al estacionamiento.
 */
export const PROMEDIO_FILA = (a) =>
  `COALESCE((${a}.limpieza + ${a}.infraestructura + ${a}.atencion + ${a}.seguridad + ${a}.acceso) / 5.0, ${a}.puntaje)`;
// Las ocultas por moderacion (denuncia de reseñas) no cuentan ni se muestran.
export const DEL_CONDUCTOR = (a) => `${a}.autor = 'CONDUCTOR' AND NOT ${a}.oculta`;

/**
 * `LEFT JOIN LATERAL ... AS rep` con la reputacion del estacionamiento `e` en
 * [desde, hasta). `desde` y `hasta` son expresiones SQL (parametros o now()).
 */
export function lateralReputacion(desde, hasta, alias = 'rep') {
  return `
  LEFT JOIN LATERAL (
    SELECT k.*,
           -- Suma de las partes ya redondeadas: asi coincide con el detalle que se muestra.
           -- (numeric: redondea los .5 hacia arriba, como Math.round)
           (ROUND((60 * (COALESCE(k.prom_general, 4) - 1) / 4)::numeric)
            + ROUND((10 * k.op_confirmacion)::numeric) + ROUND((10 * k.op_incidencias)::numeric)
            + ROUND((10 * k.op_respuesta)::numeric) + ROUND((10 * k.op_cancelaciones)::numeric))::int AS puntaje
      FROM (
        SELECT cal.cantidad AS cal_cantidad, cal.con_detalle AS cal_con_detalle, cal.general AS prom_general,
               cal.limpieza AS prom_limpieza, cal.infraestructura AS prom_infraestructura,
               cal.atencion AS prom_atencion, cal.seguridad AS prom_seguridad, cal.acceso AS prom_acceso,
               res.total AS reservas_total, res.vencidas AS reservas_vencidas, res.propias AS cancelaciones_propias,
               inc.total AS incidencias_total, inc.denunciadas AS incidencias_denunciadas,
               inc.respuesta_min,
               CASE WHEN res.total = 0 THEN 1
                    ELSE 1 - res.vencidas::float / res.total END AS op_confirmacion,
               CASE WHEN inc.total = 0 THEN 1
                    ELSE 1 - inc.denunciadas::float / inc.total END AS op_incidencias,
               CASE WHEN inc.respuesta_min IS NULL THEN 1
                    ELSE GREATEST(0, LEAST(1, (60 - inc.respuesta_min) / 50)) END AS op_respuesta,
               CASE WHEN res.total = 0 THEN 1
                    ELSE 1 - LEAST(1, 5 * res.propias::float / res.total) END AS op_cancelaciones
          FROM (
            SELECT COUNT(*)::int AS cantidad,
                   COUNT(q.limpieza)::int AS con_detalle,
                   AVG(${PROMEDIO_FILA('q')})::float AS general,
                   AVG(q.limpieza)::float AS limpieza, AVG(q.infraestructura)::float AS infraestructura,
                   AVG(q.atencion)::float AS atencion, AVG(q.seguridad)::float AS seguridad,
                   AVG(q.acceso)::float AS acceso
              FROM calificacion q
             WHERE q.id_estacionamiento = e.id_estacionamiento AND ${DEL_CONDUCTOR('q')}
               AND q.created_at >= ${desde} AND q.created_at < ${hasta}
          ) cal,
          (
            -- Las que el conductor cancelo no dicen nada del propietario.
            SELECT COUNT(*) FILTER (
                     WHERE NOT (r.estado = 'CANCELADA' AND r.cancelada_por = 'CONDUCTOR'))::int AS total,
                   COUNT(*) FILTER (
                     WHERE r.estado = 'CANCELADA' AND r.cancelada_por = 'SISTEMA')::int AS vencidas,
                   COUNT(*) FILTER (
                     WHERE r.estado = 'CANCELADA' AND r.cancelada_por = 'PROPIETARIO')::int AS propias
              FROM reserva r
              JOIN cochera cr ON cr.id_cochera = r.id_cochera
             WHERE cr.id_estacionamiento = e.id_estacionamiento
               AND r.estado <> 'PENDIENTE'
               AND r.inicio >= ${desde} AND r.inicio < ${hasta}
          ) res,
          (
            -- Una incidencia sin respuesta cuenta los minutos que lleva esperando.
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE i.denunciada_por IS NOT NULL)::int AS denunciadas,
                   AVG(EXTRACT(EPOCH FROM (
                     COALESCE(m.primera, LEAST(now(), ${hasta})) - i.created_at)) / 60)::float AS respuesta_min
              FROM incidencia i
              LEFT JOIN LATERAL (
                SELECT MIN(im.created_at) AS primera
                  FROM incidencia_mensaje im
                 WHERE im.id_incidencia = i.id_incidencia AND im.rol_autor = 'PROPIETARIO'
              ) m ON TRUE
             WHERE i.id_estacionamiento = e.id_estacionamiento
               AND i.created_at >= ${desde} AND i.created_at < ${hasta}
          ) inc
      ) k
  ) ${alias} ON TRUE`;
}

/** Columnas publicas de la reputacion para la busqueda y el detalle. */
export const COLUMNAS_REPUTACION = `
  rep.cal_cantidad AS calificaciones,
  rep.puntaje AS puntaje_reputacion,
  rep.cal_con_detalle AS calificaciones_con_detalle,
  ROUND(rep.prom_general::numeric, 1)::float AS calificacion_promedio,
  rep.prom_limpieza, rep.prom_infraestructura, rep.prom_atencion, rep.prom_seguridad, rep.prom_acceso,
  (rep.puntaje >= ${UMBRAL_DESTACADO} AND rep.cal_cantidad >= ${MINIMO_CALIFICACIONES}) AS destacado`;

/**
 * Condicion SQL de "nivel `codigo` o mas" (para filtrar). El umbral sale de
 * NIVELES, nunca del pedido: `codigo` ya viene validado.
 */
export function condicionNivelMinimo(codigo) {
  const nivel = NIVELES.find((n) => n.codigo === codigo);
  if (!nivel) throw new Error(`Nivel desconocido: ${codigo}`);
  return `(rep.cal_cantidad >= ${MINIMO_CALIFICACIONES} AND rep.puntaje >= ${Number(nivel.desde)})`;
}

/** Condicion SQL de "anfitrion destacado" (para filtrar). */
export const ES_DESTACADO = `(rep.puntaje >= ${UMBRAL_DESTACADO} AND rep.cal_cantidad >= ${MINIMO_CALIFICACIONES})`;

/**
 * Saca las columnas `prom_*` crudas de una fila de busqueda/detalle y deja
 * `calificacion_categorias` (redondeadas) e `insignias`.
 */
export function darFormaReputacion(fila) {
  const promedios = {};
  for (const { codigo } of CATEGORIAS) {
    promedios[codigo] = redondear(fila[`prom_${codigo}`]);
    delete fila[`prom_${codigo}`];
  }
  const conDetalle = fila.calificaciones_con_detalle ?? 0;
  delete fila.calificaciones_con_detalle;
  fila.calificaciones ??= 0;
  fila.puntaje_reputacion = Number(fila.puntaje_reputacion ?? 0);
  fila.nivel = nivelDe(fila.puntaje_reputacion, fila.calificaciones);
  fila.destacado = Boolean(fila.destacado);
  fila.calificacion_categorias = conDetalle > 0 ? promedios : null;
  fila.insignias = insigniasDe({ destacado: fila.destacado, conDetalle, promedios });
  return fila;
}
