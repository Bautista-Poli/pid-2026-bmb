// Reputacion del estacionamiento (Sprint 3, gamificacion "Anfitrion destacado"):
// la pantalla del propietario (delEstacionamiento).
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
//
// En esta carpeta: reglas (niveles, categorias, etiquetas) en reputacion-reglas.js,
// el SQL del puntaje en reputacion-sql.js y la del conductor en
// reputacion-conductor.service.js.
import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  CATEGORIAS,
  ETIQUETAS,
  MINIMO_CALIFICACIONES,
  NIVELES,
  UMBRAL_CATEGORIA,
  UMBRAL_DESTACADO,
  insigniasDe,
  nivelDe,
  redondear,
  siguienteNivel,
} from './reputacion-reglas.js';
import { DEL_CONDUCTOR, PROMEDIO_FILA, lateralReputacion } from './reputacion-sql.js';

/** La reputacion de un estacionamiento en la ventana [desde, hasta). */
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

  // La ventana se corta con la hora de la base (la de `created_at`), no la del
  // servidor: si el reloj del servidor va atrasado, lo recien creado quedaria afuera.
  const { rows: reloj } = await query('SELECT now() AS ahora');
  const ahora = reloj[0].ahora;
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
    nivel: nivelDe(actual.puntaje, actual.cal_cantidad),
    siguiente_nivel: siguienteNivel(actual.puntaje),
    niveles: NIVELES,
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
