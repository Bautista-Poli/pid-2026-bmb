// Reputacion del estacionamiento (Sprint 3, gamificacion "Anfitrion destacado").
//
// El puntaje (0 a 100) no se guarda: se calcula en cada consulta sobre una
// ventana de dias (90 en la busqueda; 30 o 90 en la pantalla del propietario).
//   - 60 puntos por lo que califican los conductores: el promedio general de
//     las cinco categorias, llevado de 1..5 a 0..60. Sin calificaciones en la
//     ventana se toma 4 (un estacionamiento nuevo no arranca hundido).
//   - 40 puntos por como opera, 10 por cada indicador:
//       confirmacion:  reservas que no vencieron sin confirmar (SISTEMA).
//       incidencias:   incidencias que no terminaron en denuncia.
//       respuesta:     minutos hasta la primera respuesta del propietario en el
//                      chat de cada incidencia (<= 10 min suma todo, >= 60 nada).
//       cancelaciones: cancelaciones del propietario; cada 1% resta 5%.
//
// Insignias: ANFITRION DESTACADO con puntaje >= 80 y al menos
// MINIMO_CALIFICACIONES calificaciones en la ventana; y una por categoria con
// promedio >= 4,5 (tambien con ese minimo).
import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { PLAZO_CALIFICACION_DIAS } from './calificacion.service.js';

export const UMBRAL_DESTACADO = 80;
export const MINIMO_CALIFICACIONES = 5;
export const UMBRAL_CATEGORIA = 4.5;
export const DIAS_BUSQUEDA = 90;

export const CATEGORIAS = Object.freeze([
  { codigo: 'limpieza', nombre: 'Limpieza', insignia: 'IMPECABLE', texto: 'Impecable' },
  { codigo: 'infraestructura', nombre: 'Infraestructura', insignia: 'BUENA_INFRAESTRUCTURA', texto: 'Buena infraestructura' },
  { codigo: 'atencion', nombre: 'Atencion', insignia: 'BUENA_ATENCION', texto: 'Buena atencion' },
  { codigo: 'seguridad', nombre: 'Seguridad', insignia: 'SEGURO', texto: 'Seguro' },
  { codigo: 'acceso', nombre: 'Acceso y senalizacion', insignia: 'FACIL_ACCESO', texto: 'Facil acceso' },
]);

/** Etiquetas que puede marcar el conductor; cada una apunta a una categoria. */
export const ETIQUETAS = Object.freeze([
  { codigo: 'MUY_LIMPIO', categoria: 'limpieza', positiva: true },
  { codigo: 'BIEN_ILUMINADO', categoria: 'infraestructura', positiva: true },
  { codigo: 'BUENA_ATENCION', categoria: 'atencion', positiva: true },
  { codigo: 'SEGURO', categoria: 'seguridad', positiva: true },
  { codigo: 'FACIL_DE_LLEGAR', categoria: 'acceso', positiva: true },
  { codigo: 'POCA_LIMPIEZA', categoria: 'limpieza', positiva: false },
  { codigo: 'POCA_ILUMINACION', categoria: 'infraestructura', positiva: false },
  { codigo: 'DIFICIL_DE_MANIOBRAR', categoria: 'acceso', positiva: false },
]);

export const CODIGOS_ETIQUETA = ETIQUETAS.map((e) => e.codigo);

/** Etiquetas que puede marcar el propietario al calificar al conductor. */
export const ETIQUETAS_CONDUCTOR = Object.freeze([
  { codigo: 'PUNTUAL', positiva: true },
  { codigo: 'RESPETUOSO', positiva: true },
  { codigo: 'CUIDO_LA_COCHERA', positiva: true },
  { codigo: 'LLEGO_TARDE', positiva: false },
  { codigo: 'SE_EXCEDIO', positiva: false },
  { codigo: 'NO_AVISO_AUSENCIA', positiva: false },
]);

export const CODIGOS_ETIQUETA_CONDUCTOR = ETIQUETAS_CONDUCTOR.map((e) => e.codigo);

/**
 * Nota general de una calificacion: el promedio de las cinco categorias si las
 * tiene, o su `puntaje` (las que se cargan sin detalle). Solo cuentan las del
 * CONDUCTOR: las del PROPIETARIO califican al conductor, no al estacionamiento.
 */
const PROMEDIO_FILA = (a) =>
  `COALESCE((${a}.limpieza + ${a}.infraestructura + ${a}.atencion + ${a}.seguridad + ${a}.acceso) / 5.0, ${a}.puntaje)`;
// Las ocultas por moderacion (denuncia de reseñas) no cuentan ni se muestran.
const DEL_CONDUCTOR = (a) => `${a}.autor = 'CONDUCTOR' AND NOT ${a}.oculta`;

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

/** Condicion SQL de "anfitrion destacado" (para filtrar). */
export const ES_DESTACADO = `(rep.puntaje >= ${UMBRAL_DESTACADO} AND rep.cal_cantidad >= ${MINIMO_CALIFICACIONES})`;

const redondear = (valor, decimales = 1) =>
  valor == null ? null : Math.round(valor * 10 ** decimales) / 10 ** decimales;

/* ------------------------ reputacion del conductor ------------------------ */

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

/**
 * Insignias a partir de destacado y los promedios por categoria. `conDetalle`
 * es cuantas calificaciones traen categorias (las de solo puntaje no cuentan
 * para las insignias de categoria).
 */
export function insigniasDe({ destacado, conDetalle, promedios }) {
  const insignias = [];
  if (destacado) insignias.push({ codigo: 'DESTACADO', texto: 'Anfitrion destacado' });
  if (conDetalle >= MINIMO_CALIFICACIONES) {
    for (const categoria of CATEGORIAS) {
      const promedio = promedios[categoria.codigo];
      if (promedio != null && promedio >= UMBRAL_CATEGORIA) {
        insignias.push({ codigo: categoria.insignia, texto: categoria.texto, categoria: categoria.codigo });
      }
    }
  }
  return insignias;
}

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
  fila.destacado = Boolean(fila.destacado);
  fila.calificacion_categorias = conDetalle > 0 ? promedios : null;
  fila.insignias = insigniasDe({ destacado: fila.destacado, conDetalle, promedios });
  return fila;
}

async function calcular(idEstacionamiento, desde, hasta) {
  const { rows } = await query(
    `SELECT rep.* FROM estacionamiento e
       ${lateralReputacion('$2::timestamptz', '$3::timestamptz')}
      WHERE e.id_estacionamiento = $1`,
    [idEstacionamiento, desde, hasta],
  );
  return rows[0];
}

/** Nombre corto para mostrar una opinion: "Lucia P." */
const nombreCorto = (nombre, apellido) =>
  [nombre, apellido ? `${apellido.trim().charAt(0).toUpperCase()}.` : ''].filter(Boolean).join(' ');

/**
 * La categoria con mas margen para subir y cuanto sumaria llevarla a 4,5: el
 * promedio general es la media de las cinco, asi que cada punto de una
 * categoria mueve el general 1/5, y cada punto del general vale 15 de puntaje.
 */
function sugerencia(categorias, etiquetas) {
  const candidatas = categorias
    .filter((c) => c.promedio != null && c.promedio < UMBRAL_CATEGORIA)
    .sort((a, b) => a.promedio - b.promedio);
  const peor = candidatas[0];
  if (!peor) return null;

  const negativa = etiquetas
    .filter((e) => !e.positiva && e.categoria === peor.codigo && e.cantidad > 0)
    .sort((a, b) => b.cantidad - a.cantidad)[0];

  return {
    categoria: peor.codigo,
    nombre: peor.nombre,
    promedio: peor.promedio,
    objetivo: UMBRAL_CATEGORIA,
    puntos: Math.max(1, Math.round(3 * (UMBRAL_CATEGORIA - peor.promedio))),
    etiqueta: negativa ? { codigo: negativa.codigo, cantidad: negativa.cantidad } : null,
  };
}

/**
 * Pantalla de reputacion del propietario: puntaje actual y del periodo
 * anterior (misma duracion), detalle por categoria con su tendencia,
 * indicadores de operacion, etiquetas mas marcadas y opiniones recientes.
 */
export async function delEstacionamiento(idEstacionamiento, idPropietario, { dias = 30 } = {}) {
  const { rows: duenos } = await query(
    'SELECT id_propietario FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );
  if (!duenos[0]) throw ApiError.notFound('Estacionamiento no encontrado');
  if (duenos[0].id_propietario !== idPropietario) {
    throw ApiError.forbidden('El estacionamiento pertenece a otro propietario');
  }

  const ahora = new Date();
  const desde = new Date(ahora.getTime() - dias * 86_400_000);
  const desdeAnterior = new Date(desde.getTime() - dias * 86_400_000);

  const [actual, anterior, etiquetasRes, opinionesRes] = await Promise.all([
    calcular(idEstacionamiento, desde, ahora),
    calcular(idEstacionamiento, desdeAnterior, desde),
    query(
      `SELECT etiqueta, COUNT(*)::int AS cantidad
         FROM calificacion q, unnest(q.etiquetas) AS etiqueta
        WHERE q.id_estacionamiento = $1 AND ${DEL_CONDUCTOR('q')} AND q.created_at >= $2
        GROUP BY etiqueta`,
      [idEstacionamiento, desde],
    ),
    query(
      `SELECT q.id_calificacion, q.created_at, q.comentario, q.etiquetas,
              q.denuncia_estado::text AS denuncia_estado,
              ROUND(${PROMEDIO_FILA('q')}::numeric, 1)::float AS promedio,
              u.nombre, u.apellido
         FROM calificacion q
         JOIN usuario u ON u.id_usuario = q.id_conductor
        WHERE q.id_estacionamiento = $1 AND ${DEL_CONDUCTOR('q')}
        ORDER BY q.created_at DESC
        LIMIT 10`,
      [idEstacionamiento],
    ),
  ]);

  const cantidadPorEtiqueta = Object.fromEntries(etiquetasRes.rows.map((f) => [f.etiqueta, f.cantidad]));
  const etiquetas = ETIQUETAS.map((e) => ({ ...e, cantidad: cantidadPorEtiqueta[e.codigo] ?? 0 }));

  const categorias = CATEGORIAS.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    promedio: redondear(actual[`prom_${c.codigo}`]),
    anterior: redondear(anterior[`prom_${c.codigo}`]),
  }));

  const puntosCalificaciones = Math.round(60 * ((actual.prom_general ?? 4) - 1) / 4);
  const indicador = (valor) => Math.round(10 * valor);
  const operacion = {
    confirmacion: {
      puntos: indicador(actual.op_confirmacion),
      porcentaje: Math.round(100 * actual.op_confirmacion),
      vencidas: actual.reservas_vencidas,
      reservas: actual.reservas_total,
    },
    incidencias: {
      puntos: indicador(actual.op_incidencias),
      sin_denuncia: actual.incidencias_total - actual.incidencias_denunciadas,
      total: actual.incidencias_total,
    },
    respuesta: {
      puntos: indicador(actual.op_respuesta),
      minutos: actual.respuesta_min == null ? null : Math.round(actual.respuesta_min),
    },
    cancelaciones: {
      puntos: indicador(actual.op_cancelaciones),
      propias: actual.cancelaciones_propias,
    },
  };

  const destacado = actual.puntaje >= UMBRAL_DESTACADO && actual.cal_cantidad >= MINIMO_CALIFICACIONES;
  const promedios = Object.fromEntries(categorias.map((c) => [c.codigo, c.promedio]));

  return {
    dias,
    puntaje: actual.puntaje,
    // Sin nada en el periodo anterior (ni calificaciones ni reservas) no hay con que comparar.
    puntaje_anterior:
      anterior.cal_cantidad + anterior.reservas_total + anterior.incidencias_total > 0 ? anterior.puntaje : null,
    destacado,
    umbral_destacado: UMBRAL_DESTACADO,
    minimo_calificaciones: MINIMO_CALIFICACIONES,
    calificaciones: {
      cantidad: actual.cal_cantidad,
      promedio: redondear(actual.prom_general),
      puntos: puntosCalificaciones,
      categorias,
    },
    operacion: {
      puntos: Object.values(operacion).reduce((suma, i) => suma + i.puntos, 0),
      ...operacion,
    },
    insignias: insigniasDe({ destacado, conDetalle: actual.cal_con_detalle, promedios }),
    etiquetas,
    sugerencia: sugerencia(categorias, etiquetas),
    opiniones: opinionesRes.rows.map((f) => ({
      id_calificacion: f.id_calificacion,
      autor: nombreCorto(f.nombre, f.apellido),
      created_at: f.created_at,
      promedio: f.promedio,
      comentario: f.comentario,
      etiquetas: f.etiquetas,
      denuncia_estado: f.denuncia_estado,
    })),
  };
}
