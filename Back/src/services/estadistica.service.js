import { query } from '../config/database.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

/**
 * Estadisticas del propietario para un periodo de dias locales (hora
 * argentina): ocupacion, ingresos simulados, demanda por horario,
 * cancelaciones y ausentes. Todo se agrega en SQL y las consultas corren en
 * paralelo: la base es Neon y cada ida y vuelta cuesta.
 *
 * Reglas (ver docs/.../dashboard-propietario-design.md, seccion 3):
 *   - Una reserva cuenta en el periodo si su `inicio` cae en el (conteos,
 *     ingresos, demanda); la ocupacion, en cambio, reparte sus horas por dia y
 *     solo dentro del horario de atencion (ver VENTANAS).
 *   - Ocupan la cochera PENDIENTE, CONFIRMADA, ACTIVA y FINALIZADA. NO_SHOW la
 *     libera y no se cobra.
 *   - Ingresos: FINALIZADA y ACTIVA (las de abono valen 0) + abonos vendidos.
 */

const ZONA = `'America/Argentina/Buenos_Aires'`;
const DIA = 86_400_000;

const OCUPAN = `('PENDIENTE', 'CONFIRMADA', 'ACTIVA', 'FINALIZADA')`;
const COBRADAS = `('FINALIZADA', 'ACTIVA')`;

/** Inicio de un dia local (`$n::date`) como instante. */
const desdeDia = (parametro) => `(${parametro}::date)::timestamp AT TIME ZONE ${ZONA}`;
const hastaDia = (parametro) => `(${parametro}::date + 1)::timestamp AT TIME ZONE ${ZONA}`;

/**
 * Estacionamientos que entran en el calculo: los del propietario, o uno solo.
 * Parametros: $1 propietario, $4 estacionamiento (o NULL).
 */
const ESTACIONAMIENTOS = `
  SELECT id_estacionamiento FROM estacionamiento
   WHERE id_propietario = $1 AND ($4::uuid IS NULL OR id_estacionamiento = $4::uuid)`;

/** Reservas de esos estacionamientos con `inicio` en [$2, $3] (dias locales). */
const RESERVAS = `
  SELECT r.*
    FROM reserva r
    JOIN cochera c ON c.id_cochera = r.id_cochera
   WHERE c.id_estacionamiento IN (${ESTACIONAMIENTOS})
     AND r.inicio >= ${desdeDia('$2')}
     AND r.inicio <  ${hastaDia('$3')}`;

// Fechas puras (date + entero): no dependen de la zona horaria de la sesion.
const DIAS = `SELECT $2::date + i AS fecha FROM generate_series(0, $3::date - $2::date) i`;

const numero = (valor) => Number(valor ?? 0);
const redondear = (valor, decimales = 2) => Math.round(valor * 10 ** decimales) / 10 ** decimales;

/**
 * Por cada dia, la ventana de atencion de cada cochera activa: [apertura,
 * cierre) en hora local, con 23:59 tratado como medianoche. Es el universo de
 * la ocupacion: las horas ofrecidas son estas ventanas, y las usadas son la
 * parte de cada reserva que cae adentro. Asi la ocupacion nunca pasa el 100 %
 * (una JORNADA de 24 h en un lugar que abre 12 h cuenta 12) y no suman
 * cocheras dadas de baja ni estacionamientos sin horario.
 */
const VENTANAS = `
  SELECT d.fecha, c.id_cochera,
         (d.fecha + h.hora_apertura) AT TIME ZONE ${ZONA} AS abre,
         (CASE WHEN h.hora_cierre >= '23:59' THEN (d.fecha + 1)::timestamp
               ELSE d.fecha + h.hora_cierre END) AT TIME ZONE ${ZONA} AS cierra
    FROM dias d
    JOIN cochera c ON c.activo AND c.id_estacionamiento IN (${ESTACIONAMIENTOS})
    JOIN horario h ON h.id_estacionamiento = c.id_estacionamiento
                  AND h.dia_semana = EXTRACT(DOW FROM d.fecha)`;

async function horasPorDia(parametros) {
  const { rows } = await query(
    `WITH dias AS (${DIAS}),
     ventanas AS (${VENTANAS}),
     ofrecidas AS (
       SELECT fecha, SUM(EXTRACT(EPOCH FROM (cierra - abre)) / 3600) AS horas
         FROM ventanas GROUP BY fecha
     ),
     usadas AS (
       SELECT v.fecha,
              SUM(EXTRACT(EPOCH FROM (LEAST(r.fin, v.cierra) - GREATEST(r.inicio, v.abre))) / 3600) AS horas
         FROM ventanas v
         JOIN reserva r ON r.id_cochera = v.id_cochera
                       AND r.inicio < v.cierra
                       AND r.fin > v.abre
                       AND r.estado IN ${OCUPAN}
        GROUP BY v.fecha
     )
     SELECT d.fecha::text AS fecha, COALESCE(u.horas, 0) AS usadas, COALESCE(o.horas, 0) AS ofrecidas
       FROM dias d
       LEFT JOIN usadas u ON u.fecha = d.fecha
       LEFT JOIN ofrecidas o ON o.fecha = d.fecha
      ORDER BY d.fecha`,
    parametros,
  );
  return rows.map((r) => ({
    fecha: r.fecha,
    horasUsadas: redondear(numero(r.usadas)),
    horasOfrecidas: redondear(numero(r.ofrecidas)),
  }));
}

async function ingresosPorDia(parametros) {
  const { rows } = await query(
    `WITH dias AS (${DIAS}),
     reservas AS (
       SELECT (r.inicio AT TIME ZONE ${ZONA})::date AS fecha, SUM(r.precio_total) AS monto
         FROM (${RESERVAS}) r
        WHERE r.estado IN ${COBRADAS} AND r.modalidad <> 'ABONO'
        GROUP BY 1
     ),
     abonos AS (
       SELECT (a.created_at AT TIME ZONE ${ZONA})::date AS fecha, SUM(a.precio_total) AS monto
         FROM abono a
        WHERE a.id_estacionamiento IN (${ESTACIONAMIENTOS})
          AND a.created_at >= ${desdeDia('$2')}
          AND a.created_at <  ${hastaDia('$3')}
        GROUP BY 1
     )
     SELECT d.fecha::text AS fecha, COALESCE(r.monto, 0) AS reservas, COALESCE(a.monto, 0) AS abonos
       FROM dias d
       LEFT JOIN reservas r ON r.fecha = d.fecha
       LEFT JOIN abonos a ON a.fecha = d.fecha
      ORDER BY d.fecha`,
    parametros,
  );
  return rows.map((r) => ({ fecha: r.fecha, reservas: numero(r.reservas), abonos: numero(r.abonos) }));
}

/** Reservas por (dia de semana, hora local) que ocupan cada hora; sin canceladas ni ausentes. */
async function demanda(parametros) {
  const { rows } = await query(
    `SELECT EXTRACT(DOW FROM hora)::int AS dia_semana, EXTRACT(HOUR FROM hora)::int AS hora,
            COUNT(*)::int AS reservas
       FROM (${RESERVAS}) r,
            LATERAL generate_series(
              date_trunc('hour', r.inicio AT TIME ZONE ${ZONA}),
              (r.fin AT TIME ZONE ${ZONA}) - interval '1 second',
              interval '1 hour'
            ) AS hora
      WHERE r.estado IN ${OCUPAN}
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    parametros,
  );
  return rows.map((r) => ({ diaSemana: r.dia_semana, hora: r.hora, reservas: r.reservas }));
}

/** Totales del periodo: reservas, canceladas por origen, ausentes, proyectados. */
async function conteos(parametros) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA')::int AS canceladas,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA' AND cancelada_por = 'CONDUCTOR')::int AS conductor,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA' AND cancelada_por = 'PROPIETARIO')::int AS propietario,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA' AND cancelada_por = 'SISTEMA')::int AS sistema,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA' AND cancelada_por IS NULL)::int AS sin_dato,
            COUNT(*) FILTER (WHERE estado = 'NO_SHOW')::int AS ausentes,
            AVG(EXTRACT(EPOCH FROM (inicio - cancelada_en)) / 3600)
              FILTER (WHERE estado = 'CANCELADA' AND cancelada_por = 'CONDUCTOR'
                        AND cancelada_en < inicio AND id_abono IS NULL)
              AS anticipacion,
            COALESCE(SUM(precio_total) FILTER (WHERE estado = 'CONFIRMADA' AND inicio > now()), 0) AS proyectados
       FROM (${RESERVAS}) r`,
    parametros,
  );
  return rows[0];
}

const tasa = (parte, total) => (total > 0 ? redondear(parte / total, 4) : 0);

/** Los KPIs de un periodo (se usan tambien para el periodo anterior). */
function kpisDe({ horas, ingresos, totales }) {
  const usadas = horas.reduce((suma, d) => suma + d.horasUsadas, 0);
  const ofrecidas = horas.reduce((suma, d) => suma + d.horasOfrecidas, 0);
  return {
    ocupacion: ofrecidas > 0 ? usadas / ofrecidas : 0,
    ingresos: ingresos.reduce((suma, d) => suma + d.reservas + d.abonos, 0),
    reservas: totales.total,
    tasaCancelacion: tasa(totales.canceladas, totales.total),
    ausentes: totales.ausentes,
  };
}

async function periodo(idPropietario, desde, hasta, idEstacionamiento, { conDemanda = false } = {}) {
  const parametros = [idPropietario, desde, hasta, idEstacionamiento ?? null];
  const [horas, ingresos, totales, celdas] = await Promise.all([
    horasPorDia(parametros),
    ingresosPorDia(parametros),
    conteos(parametros),
    conDemanda ? demanda(parametros) : [],
  ]);
  return { horas, ingresos, totales, celdas };
}

/** El periodo inmediatamente anterior, del mismo largo. */
function anteriorA(desde, hasta) {
  const largo = (Date.parse(hasta) - Date.parse(desde)) / DIA + 1;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  return { desde: iso(Date.parse(desde) - largo * DIA), hasta: iso(Date.parse(desde) - DIA) };
}

export async function delPropietario(idPropietario, { desde, hasta, id_estacionamiento: idEstacionamiento }) {
  if (idEstacionamiento) await asegurarPropiedad(idEstacionamiento, idPropietario);

  const previo = anteriorA(desde, hasta);
  const [actual, anterior] = await Promise.all([
    periodo(idPropietario, desde, hasta, idEstacionamiento, { conDemanda: true }),
    periodo(idPropietario, previo.desde, previo.hasta, idEstacionamiento),
  ]);
  const { celdas } = actual;

  const ahora = kpisDe(actual);
  const antes = kpisDe(anterior);
  const kpis = Object.fromEntries(
    Object.keys(ahora).map((clave) => [clave, { valor: ahora[clave], anterior: antes[clave] }]),
  );

  const pico = celdas.reduce((max, c) => (!max || c.reservas > max.reservas ? c : max), null);
  const { totales } = actual;

  return {
    periodo: { desde, hasta },
    kpis,
    ocupacionPorDia: actual.horas,
    ingresosPorDia: actual.ingresos,
    ingresosProyectados: numero(totales.proyectados),
    demanda: celdas,
    horaPico: pico ? { diaSemana: pico.diaSemana, hora: pico.hora } : null,
    cancelaciones: {
      total: totales.canceladas,
      porOrigen: {
        CONDUCTOR: totales.conductor,
        PROPIETARIO: totales.propietario,
        SISTEMA: totales.sistema,
        SIN_DATO: totales.sin_dato,
      },
      anticipacionPromedioHoras: totales.anticipacion === null ? null : redondear(numero(totales.anticipacion), 1),
    },
    ausentes: { total: totales.ausentes, tasa: tasa(totales.ausentes, totales.total) },
  };
}
