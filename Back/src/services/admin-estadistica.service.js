// Dashboard del administrador: lo que hay para revisar (estacionamientos
// pendientes), los conflictos del periodo (bloqueos de cocheras y
// estacionamientos problematicos) y la actividad de toda la plataforma. Igual
// que estadistica/estadistica.service.js: todo en SQL, consultas en paralelo, dias en hora
// argentina. Ver docs/.../dashboard-administrador-design.md.
import { query } from '../config/database.js';
import { AVISO_CANCELADA_SIN_ALTERNATIVA, AVISO_REASIGNADA } from './cochera/cochera-bloqueo.service.js';
import { anteriorA, numero, redondear } from './estadistica/estadistica-calculos.js';
import { COBRADAS, ZONA, desdeDia, hastaDia } from './estadistica/estadistica-sql.js';

const LIMITE_LISTA = 5;
const LIMITE_PROBLEMATICOS = 20;

const MIN_RESERVAS_PROBLEMATICO = 5;
const TASA_CANCELACION_PROBLEMATICO = 0.3;

/** Instante en el periodo [$1, $2] (dias locales). */
const EN_PERIODO = (columna) => `${columna} >= ${desdeDia('$1')} AND ${columna} < ${hastaDia('$2')}`;

/** Reservas de toda la plataforma con `inicio` en el periodo, con su estacionamiento. */
const RESERVAS = `
  SELECT r.*, c.id_estacionamiento
    FROM reserva r JOIN cochera c ON c.id_cochera = r.id_cochera
   WHERE ${EN_PERIODO('r.inicio')}`;

/* ----------------------------- para revisar ----------------------------- */

/** La cola actual de revision: no depende del periodo. */
async function pendientes() {
  const [{ rows: cola }, { rows: totales }] = await Promise.all([
    query(
      `SELECT e.id_estacionamiento AS id, e.nombre, e.enviado_en,
              u.nombre || ' ' || u.apellido AS propietario
         FROM estacionamiento e JOIN usuario u ON u.id_usuario = e.id_propietario
        WHERE e.activo AND e.estado_aprobacion = 'PENDIENTE'
        ORDER BY e.enviado_en ASC, e.id_estacionamiento
        LIMIT $1`,
      [LIMITE_LISTA],
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE estado_aprobacion = 'PENDIENTE')::int AS en_cola,
              COUNT(*) FILTER (WHERE estado_aprobacion = 'RECHAZADO')::int AS rechazados
         FROM estacionamiento WHERE activo`,
    ),
  ]);
  return {
    enCola: totales[0].en_cola,
    masAntiguoDesde: cola[0]?.enviado_en ?? null,
    primeros: cola.map((e) => ({ id: e.id, nombre: e.nombre, propietario: e.propietario, enviadoEn: e.enviado_en })),
    rechazadosSinReenviar: totales[0].rechazados,
  };
}

/* ------------------------------ conflictos ------------------------------ */

/**
 * Lo que dejan los bloqueos de cocheras: reservas reasignadas o canceladas
 * (quedan como canceladas por el propietario, con el aviso cargado). Una
 * reasignada que despues cancelo el conductor no es ni una cosa ni la otra.
 */
async function bloqueos(desde, hasta) {
  const { rows } = await query(
    `WITH r AS (${RESERVAS})
     SELECT e.id_estacionamiento AS id, e.nombre,
            COUNT(*) FILTER (WHERE r.motivo_reasignacion = $3 AND r.estado <> 'CANCELADA')::int AS reasignadas,
            COUNT(*) FILTER (WHERE r.estado = 'CANCELADA' AND r.motivo_reasignacion = $4
                               AND r.cancelada_por IS DISTINCT FROM 'CONDUCTOR')::int AS canceladas
       FROM r JOIN estacionamiento e ON e.id_estacionamiento = r.id_estacionamiento
      GROUP BY e.id_estacionamiento, e.nombre`,
    [desde, hasta, AVISO_REASIGNADA, AVISO_CANCELADA_SIN_ALTERNATIVA],
  );
  const porEstacionamiento = rows.filter((b) => b.reasignadas + b.canceladas > 0);
  const total = (b) => b.reasignadas + b.canceladas;
  const suma = (campo) => porEstacionamiento.reduce((acumulado, b) => acumulado + b[campo], 0);
  return {
    reasignadas: suma('reasignadas'),
    canceladas: suma('canceladas'),
    porEstacionamiento: porEstacionamiento
      .sort((a, b) => total(b) - total(a) || a.nombre.localeCompare(b.nombre))
      .slice(0, LIMITE_LISTA),
  };
}

/**
 * Estacionamientos activos con suficientes reservas en el periodo que cancelan
 * mucho por su lado (propietario o sistema: no confirmo a tiempo).
 */
async function problematicos(desde, hasta) {
  const { rows } = await query(
    `WITH r AS (${RESERVAS}),
     agregado AS (
       SELECT id_estacionamiento, COUNT(*)::int AS reservas,
              COUNT(*) FILTER (WHERE estado = 'CANCELADA'
                                 AND cancelada_por IN ('PROPIETARIO', 'SISTEMA'))::int AS canceladas
         FROM r GROUP BY 1
       HAVING COUNT(*) >= $3
     )
     SELECT e.id_estacionamiento AS id, e.nombre, u.nombre || ' ' || u.apellido AS propietario,
            a.reservas, a.canceladas
       FROM agregado a
       JOIN estacionamiento e ON e.id_estacionamiento = a.id_estacionamiento AND e.activo
       JOIN usuario u         ON u.id_usuario = e.id_propietario`,
    [desde, hasta, MIN_RESERVAS_PROBLEMATICO],
  );
  return rows
    .map((f) => ({
      id: f.id,
      nombre: f.nombre,
      propietario: f.propietario,
      reservas: f.reservas,
      tasaCancelacion: redondear(f.canceladas / f.reservas, 4),
    }))
    .filter((p) => p.tasaCancelacion > TASA_CANCELACION_PROBLEMATICO)
    .sort((a, b) => b.tasaCancelacion - a.tasaCancelacion)
    .slice(0, LIMITE_PROBLEMATICOS);
}

/* ------------------------------ actividad ------------------------------- */

/**
 * Ingresos por estacionamiento en el periodo, como los del propietario:
 * reservas cobradas (sin las de abono) + abonos vendidos.
 */
const INGRESOS_POR_ESTACIONAMIENTO = `
  SELECT id_estacionamiento, SUM(monto) AS monto FROM (
    SELECT c.id_estacionamiento, r.precio_total AS monto
      FROM reserva r JOIN cochera c ON c.id_cochera = r.id_cochera
     WHERE ${EN_PERIODO('r.inicio')} AND r.estado IN ${COBRADAS} AND r.modalidad <> 'ABONO'
    UNION ALL
    SELECT a.id_estacionamiento, a.precio_total
      FROM abono a WHERE ${EN_PERIODO('a.created_at')}
  ) movimientos
  GROUP BY 1`;

/** Los numeros de un periodo (se usan tambien para el periodo anterior). */
async function kpisDe(desde, hasta) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*) FROM usuario WHERE ${EN_PERIODO('created_at')} AND 'CONDUCTOR' = ANY(roles))::int AS conductores,
       (SELECT COUNT(*) FROM usuario WHERE ${EN_PERIODO('created_at')} AND 'PROPIETARIO' = ANY(roles))::int AS propietarios,
       (SELECT COUNT(*) FROM estacionamiento
         WHERE estado_aprobacion = 'APROBADO' AND ${EN_PERIODO('revisado_en')})::int AS aprobados,
       r.reservas, r.canceladas,
       (SELECT COALESCE(SUM(monto), 0) FROM (${INGRESOS_POR_ESTACIONAMIENTO}) x) AS volumen
       FROM (SELECT COUNT(*)::int AS reservas, COUNT(*) FILTER (WHERE estado = 'CANCELADA')::int AS canceladas
               FROM reserva WHERE ${EN_PERIODO('inicio')}) r`,
    [desde, hasta],
  );
  const f = rows[0];
  return {
    conductoresNuevos: f.conductores,
    propietariosNuevos: f.propietarios,
    estacionamientosAprobados: f.aprobados,
    reservas: f.reservas,
    volumen: numero(f.volumen),
    tasaCancelacion: f.reservas > 0 ? redondear(f.canceladas / f.reservas, 4) : 0,
  };
}

/** Una fila por dia del periodo (tambien los dias sin reservas), por estado. */
async function reservasPorDia(desde, hasta) {
  const { rows } = await query(
    `WITH dias AS (SELECT $1::date + i AS fecha FROM generate_series(0, $2::date - $1::date) i),
     r AS (
       SELECT (inicio AT TIME ZONE ${ZONA})::date AS fecha, estado::text AS estado
         FROM reserva WHERE ${EN_PERIODO('inicio')}
     )
     SELECT d.fecha::text AS fecha,
            COUNT(r.*) FILTER (WHERE r.estado = 'FINALIZADA')::int AS finalizadas,
            COUNT(r.*) FILTER (WHERE r.estado = 'ACTIVA')::int AS en_curso,
            COUNT(r.*) FILTER (WHERE r.estado = 'CONFIRMADA')::int AS confirmadas,
            COUNT(r.*) FILTER (WHERE r.estado = 'PENDIENTE')::int AS pendientes,
            COUNT(r.*) FILTER (WHERE r.estado = 'CANCELADA')::int AS canceladas,
            COUNT(r.*) FILTER (WHERE r.estado = 'NO_SHOW')::int AS ausentes
       FROM dias d LEFT JOIN r ON r.fecha = d.fecha
      GROUP BY d.fecha ORDER BY d.fecha`,
    [desde, hasta],
  );
  return rows.map((f) => ({
    fecha: f.fecha,
    finalizadas: f.finalizadas,
    enCurso: f.en_curso,
    confirmadas: f.confirmadas,
    pendientes: f.pendientes,
    canceladas: f.canceladas,
    ausentes: f.ausentes,
  }));
}

/** Los 5 estacionamientos con mas reservas y con mas ingresos del periodo. */
async function rankings(desde, hasta) {
  const ranking = (subconsulta) =>
    query(
      `SELECT e.id_estacionamiento AS id, e.nombre, x.valor
         FROM (${subconsulta}) x JOIN estacionamiento e ON e.id_estacionamiento = x.id_estacionamiento
        WHERE x.valor > 0
        ORDER BY x.valor DESC, e.nombre
        LIMIT $3`,
      [desde, hasta, LIMITE_LISTA],
    );
  const [{ rows: porReservas }, { rows: porIngresos }] = await Promise.all([
    ranking(`SELECT id_estacionamiento, COUNT(*) AS valor FROM (${RESERVAS}) r GROUP BY 1`),
    ranking(`SELECT id_estacionamiento, monto AS valor FROM (${INGRESOS_POR_ESTACIONAMIENTO}) i`),
  ]);
  const aFila = (f) => ({ id: f.id, nombre: f.nombre, valor: numero(f.valor) });
  return { topPorReservas: porReservas.map(aFila), topPorIngresos: porIngresos.map(aFila) };
}

/** Actividad de la plataforma en el periodo, comparada con el anterior. */
async function actividad(desde, hasta) {
  const previo = anteriorA(desde, hasta);
  const [ahora, antes, porDia, tops] = await Promise.all([
    kpisDe(desde, hasta),
    kpisDe(previo.desde, previo.hasta),
    reservasPorDia(desde, hasta),
    rankings(desde, hasta),
  ]);
  const kpis = Object.fromEntries(
    Object.keys(ahora).map((clave) => [clave, { valor: ahora[clave], anterior: antes[clave] }]),
  );
  return { kpis, reservasPorDia: porDia, ...tops };
}

/* ------------------------------------------------------------------------ */

/** Todo el tablero del admin: pendientes, bloqueos, problemas y actividad. */
export async function estadisticas({ desde, hasta }) {
  const [revisar, enBloqueos, conProblemas, deLaPlataforma] = await Promise.all([
    pendientes(),
    bloqueos(desde, hasta),
    problematicos(desde, hasta),
    actividad(desde, hasta),
  ]);
  return {
    periodo: { desde, hasta },
    pendientes: revisar,
    conflictos: { bloqueos: enBloqueos, problematicos: conProblemas },
    actividad: deLaPlataforma,
  };
}
