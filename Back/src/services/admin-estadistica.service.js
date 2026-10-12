// Dashboard del administrador: lo que hay para revisar (estacionamientos
// pendientes y disputas), los conflictos del periodo (bloqueos de cocheras y
// estacionamientos problematicos) y la actividad de toda la plataforma. Igual
// que estadistica.service.js: todo en SQL, consultas en paralelo, dias en hora
// argentina. Ver docs/.../dashboard-administrador-design.md.
import { query } from '../config/database.js';

const LIMITE_LISTA = 5;

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

/* ------------------------------------------------------------------------ */

export async function estadisticas({ desde, hasta }) {
  const [revisar, enDisputa] = await Promise.all([pendientes(), disputas()]);
  return {
    periodo: { desde, hasta },
    pendientes: revisar,
    disputas: enDisputa,
    conflictos: { bloqueos: null, problematicos: [] },
    actividad: null,
  };
}
