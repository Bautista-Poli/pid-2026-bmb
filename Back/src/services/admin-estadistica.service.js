// Dashboard del administrador: lo que hay para revisar (estacionamientos
// pendientes y disputas), los conflictos del periodo (bloqueos de cocheras y
// estacionamientos problematicos) y la actividad de toda la plataforma. Igual
// que estadistica.service.js: todo en SQL, consultas en paralelo, dias en hora
// argentina. Ver docs/.../dashboard-administrador-design.md.
import { query } from '../config/database.js';
import { desdeDia, hastaDia, redondear } from './estadistica.service.js';

const LIMITE_LISTA = 5;
const LIMITE_PROBLEMATICOS = 20;

export const MIN_RESERVAS_PROBLEMATICO = 5;
export const TASA_CANCELACION_PROBLEMATICO = 0.3;
export const MIN_RECLAMOS_PROBLEMATICO = 2;

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

/** Incidencias denunciadas (la cola de /admin/disputas) y reclamos que siguen entre las partes. */
async function disputas() {
  const [{ rows: cola }, { rows: totales }] = await Promise.all([
    query(
      `SELECT i.id_incidencia AS id, i.tipo::text AS tipo, i.motivo::text AS motivo,
              e.nombre AS estacionamiento, i.denunciada_at
         FROM incidencia i JOIN estacionamiento e ON e.id_estacionamiento = i.id_estacionamiento
        WHERE i.estado = 'DENUNCIADA'
        ORDER BY i.denunciada_at ASC NULLS LAST, i.id_incidencia
        LIMIT $1`,
      [LIMITE_LISTA],
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE estado = 'DENUNCIADA')::int AS denunciadas,
              COUNT(*) FILTER (WHERE estado = 'ABIERTA' AND abierta_por IS NOT NULL)::int AS en_conversacion
         FROM incidencia`,
    ),
  ]);
  return {
    denunciadas: totales[0].denunciadas,
    masAntiguaDesde: cola[0]?.denunciada_at ?? null,
    primeras: cola.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      motivo: d.motivo,
      estacionamiento: d.estacionamiento,
      denunciadaEn: d.denunciada_at,
    })),
    reclamosEnConversacion: totales[0].en_conversacion,
  };
}

/* ------------------------------ conflictos ------------------------------ */

/**
 * Lo que dejan los bloqueos de cocheras: reservas reasignadas o canceladas
 * (hoy quedan como canceladas por el propietario, con el aviso cargado) y las
 * incidencias del sistema. Una reasignada que despues cancelo el conductor no
 * es ni una cosa ni la otra.
 */
async function bloqueos(desde, hasta) {
  const { rows } = await query(
    `WITH r AS (${RESERVAS}),
     por_reserva AS (
       SELECT id_estacionamiento,
              COUNT(*) FILTER (WHERE motivo_reasignacion IS NOT NULL AND estado <> 'CANCELADA') AS reasignadas,
              COUNT(*) FILTER (WHERE estado = 'CANCELADA' AND motivo_reasignacion IS NOT NULL
                                 AND cancelada_por IS DISTINCT FROM 'CONDUCTOR') AS canceladas
         FROM r GROUP BY 1
     ),
     por_incidencia AS (
       SELECT id_estacionamiento,
              COUNT(*) FILTER (WHERE tipo = 'AUTO_EXCEDIDO') AS autos,
              COUNT(*) FILTER (WHERE tipo = 'RESERVA_AFECTADA') AS sin_cochera
         FROM incidencia WHERE ${EN_PERIODO('created_at')} GROUP BY 1
     )
     SELECT e.id_estacionamiento AS id, e.nombre,
            COALESCE(pr.reasignadas, 0)::int AS reasignadas, COALESCE(pr.canceladas, 0)::int AS canceladas,
            COALESCE(pi.autos, 0)::int AS autos, COALESCE(pi.sin_cochera, 0)::int AS sin_cochera
       FROM estacionamiento e
       LEFT JOIN por_reserva pr    ON pr.id_estacionamiento = e.id_estacionamiento
       LEFT JOIN por_incidencia pi ON pi.id_estacionamiento = e.id_estacionamiento
      WHERE COALESCE(pr.reasignadas, 0) + COALESCE(pr.canceladas, 0)
            + COALESCE(pi.autos, 0) + COALESCE(pi.sin_cochera, 0) > 0`,
    [desde, hasta],
  );
  const porEstacionamiento = rows.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    reasignadas: f.reasignadas,
    canceladas: f.canceladas,
    autosExcedidos: f.autos,
    sinCochera: f.sin_cochera,
  }));
  const total = (b) => b.reasignadas + b.canceladas + b.autosExcedidos + b.sinCochera;
  const suma = (campo) => porEstacionamiento.reduce((acumulado, b) => acumulado + b[campo], 0);
  return {
    reasignadas: suma('reasignadas'),
    canceladas: suma('canceladas'),
    autosExcedidos: suma('autosExcedidos'),
    sinCochera: suma('sinCochera'),
    porEstacionamiento: porEstacionamiento.sort((a, b) => total(b) - total(a)).slice(0, LIMITE_LISTA),
  };
}

/**
 * Estacionamientos activos con suficientes reservas en el periodo que cancelan
 * mucho por su lado (propietario o sistema: no confirmo a tiempo) o acumulan
 * reclamos abiertos o perdidos.
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
     ),
     reclamos AS (
       SELECT id_estacionamiento, COUNT(*)::int AS cantidad
         FROM incidencia
        WHERE abierta_por IS NOT NULL AND ${EN_PERIODO('created_at')}
          AND (estado IN ('ABIERTA', 'DENUNCIADA') OR resolucion = 'A_FAVOR_CONDUCTOR')
        GROUP BY 1
     )
     SELECT e.id_estacionamiento AS id, e.nombre, u.nombre || ' ' || u.apellido AS propietario,
            a.reservas, a.canceladas, COALESCE(rc.cantidad, 0) AS reclamos
       FROM agregado a
       JOIN estacionamiento e ON e.id_estacionamiento = a.id_estacionamiento AND e.activo
       JOIN usuario u         ON u.id_usuario = e.id_propietario
       LEFT JOIN reclamos rc  ON rc.id_estacionamiento = a.id_estacionamiento`,
    [desde, hasta, MIN_RESERVAS_PROBLEMATICO],
  );
  return rows
    .map((f) => {
      const tasaCancelacion = redondear(f.canceladas / f.reservas, 4);
      const razones = [];
      if (tasaCancelacion > TASA_CANCELACION_PROBLEMATICO) razones.push('CANCELACIONES');
      if (f.reclamos >= MIN_RECLAMOS_PROBLEMATICO) razones.push('RECLAMOS');
      return { id: f.id, nombre: f.nombre, propietario: f.propietario, reservas: f.reservas, tasaCancelacion, reclamos: f.reclamos, razones };
    })
    .filter((p) => p.razones.length > 0)
    .sort((a, b) => b.razones.length - a.razones.length || b.tasaCancelacion - a.tasaCancelacion)
    .slice(0, LIMITE_PROBLEMATICOS);
}

/* ------------------------------------------------------------------------ */

export async function estadisticas({ desde, hasta }) {
  const [revisar, enDisputa, enBloqueos, conProblemas] = await Promise.all([
    pendientes(),
    disputas(),
    bloqueos(desde, hasta),
    problematicos(desde, hasta),
  ]);
  return {
    periodo: { desde, hasta },
    pendientes: revisar,
    disputas: enDisputa,
    conflictos: { bloqueos: enBloqueos, problematicos: conProblemas },
    actividad: null,
  };
}
