// Calificaciones y reputacion: constantes y fragmentos SQL compartidos.
//
// La reputacion del estacionamiento son las calificaciones que le dejan los
// conductores; la del conductor, las que le dejan los propietarios.

export const AUTORES_CALIFICACION = Object.freeze({
  CONDUCTOR: 'CONDUCTOR',
  PROPIETARIO: 'PROPIETARIO',
});

/** Dias para calificar desde que termina la reserva (egreso real o, si no hay, `fin`). */
export const PLAZO_CALIFICACION_DIAS = 14;

/** Peso del promedio general en el puntaje para ordenar (promedio ponderado). */
export const PESO_PRIOR = 5;

/** Promedio general cuando todavia no hay ninguna calificacion. */
export const PROMEDIO_SIN_DATOS = 3;

export const MAX_COMENTARIO = 500;

/** Ultimo instante para calificar la reserva `alias`. */
export const limiteCalificacionSql = (alias = 'r') =>
  `(COALESCE(${alias}.egreso_real, ${alias}.fin) + interval '${PLAZO_CALIFICACION_DIAS} days')`;

const DE_CONDUCTORES = `cal.autor = '${AUTORES_CALIFICACION.CONDUCTOR}'`;
const DE_PROPIETARIOS = `cal.autor = '${AUTORES_CALIFICACION.PROPIETARIO}'`;

/** Promedio redondeado a un decimal (lo que ve el conductor), o NULL sin calificaciones. */
export const promedioEstacionamientoSql = (alias = 'e') => `
  (SELECT ROUND(AVG(cal.puntaje), 1)
     FROM calificacion cal
    WHERE cal.id_estacionamiento = ${alias}.id_estacionamiento AND ${DE_CONDUCTORES})`;

/** Promedio de todas las calificaciones a estacionamientos (`m` del ponderado). */
const PROMEDIO_GENERAL = `(SELECT COALESCE(AVG(g.puntaje), ${PROMEDIO_SIN_DATOS})
     FROM calificacion g WHERE g.autor = '${AUTORES_CALIFICACION.CONDUCTOR}')`;

/**
 * Columnas `calificacion_promedio`, `cantidad_calificaciones` y `puntaje_orden`
 * del estacionamiento `alias`. `puntaje_orden` es el promedio ponderado
 * (PESO_PRIOR * m + suma) / (PESO_PRIOR + n), con `m` el promedio general: con
 * pocas calificaciones queda cerca de `m` y sin ninguna vale `m`.
 */
export const reputacionEstacionamiento = (alias = 'e') => `
  ${promedioEstacionamientoSql(alias)}::float AS calificacion_promedio,
  (SELECT COUNT(*)::int
     FROM calificacion cal
    WHERE cal.id_estacionamiento = ${alias}.id_estacionamiento AND ${DE_CONDUCTORES}) AS cantidad_calificaciones,
  (SELECT ((${PESO_PRIOR} * ${PROMEDIO_GENERAL} + COALESCE(SUM(cal.puntaje), 0))
           / (${PESO_PRIOR} + COUNT(*)))::float
     FROM calificacion cal
    WHERE cal.id_estacionamiento = ${alias}.id_estacionamiento AND ${DE_CONDUCTORES}) AS puntaje_orden`;

/** Columnas `conductor_calificacion_promedio` y `conductor_cantidad_calificaciones`. */
export const reputacionConductor = (columnaId) => `
  (SELECT ROUND(AVG(cal.puntaje), 1)::float
     FROM calificacion cal
    WHERE cal.id_conductor = ${columnaId} AND ${DE_PROPIETARIOS}) AS conductor_calificacion_promedio,
  (SELECT COUNT(*)::int
     FROM calificacion cal
    WHERE cal.id_conductor = ${columnaId} AND ${DE_PROPIETARIOS}) AS conductor_cantidad_calificaciones`;
