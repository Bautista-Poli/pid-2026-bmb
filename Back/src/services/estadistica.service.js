import { query } from '../config/database.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

/**
 * Estadisticas del propietario para un periodo de dias locales (hora
 * argentina): ocupacion, ingresos simulados, demanda por horario,
 * cancelaciones y ausentes. Todo se agrega en SQL y las consultas corren en
 * paralelo: la base es Neon y cada ida y vuelta cuesta.
 *
 * Reglas (ver docs/.../dashboard-propietario-design.md, seccion 3):
 *   - Una reserva cuenta en el periodo si su `inicio` cae en el; la ocupacion,
 *     en cambio, reparte sus horas por dia aunque cruce la medianoche.
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

const DIAS = `SELECT d::date AS fecha FROM generate_series($2::date, $3::date, interval '1 day') d`;

const fechaISO = (fecha) => (fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha));
const numero = (valor) => Number(valor ?? 0);
const redondear = (valor, decimales = 2) => Math.round(valor * 10 ** decimales) / 10 ** decimales;

async function horasPorDia(parametros) {
  const { rows } = await query(
    `WITH dias AS (${DIAS}),
     ofrecidas AS (
       SELECT d.fecha,
              SUM(EXTRACT(EPOCH FROM (h.hora_cierre - h.hora_apertura)) / 3600 * c.cantidad) AS horas
         FROM dias d
         JOIN horario h ON h.dia_semana = EXTRACT(DOW FROM d.fecha)
                       AND h.id_estacionamiento IN (${ESTACIONAMIENTOS})
         JOIN (SELECT id_estacionamiento, COUNT(*) AS cantidad
                 FROM cochera WHERE activo GROUP BY id_estacionamiento) c
           ON c.id_estacionamiento = h.id_estacionamiento
        GROUP BY d.fecha
     ),
     usadas AS (
       SELECT d.fecha,
              SUM(EXTRACT(EPOCH FROM (
                LEAST(r.fin, (d.fecha + 1)::timestamp AT TIME ZONE ${ZONA})
                - GREATEST(r.inicio, d.fecha::timestamp AT TIME ZONE ${ZONA})
              )) / 3600) AS horas
         FROM dias d
         JOIN reserva r ON r.inicio < (d.fecha + 1)::timestamp AT TIME ZONE ${ZONA}
                       AND r.fin > d.fecha::timestamp AT TIME ZONE ${ZONA}
         JOIN cochera c ON c.id_cochera = r.id_cochera
        WHERE r.estado IN ${OCUPAN}
          AND c.id_estacionamiento IN (${ESTACIONAMIENTOS})
        GROUP BY d.fecha
     )
     SELECT d.fecha, COALESCE(u.horas, 0) AS usadas, COALESCE(o.horas, 0) AS ofrecidas
       FROM dias d
       LEFT JOIN usadas u ON u.fecha = d.fecha
       LEFT JOIN ofrecidas o ON o.fecha = d.fecha
      ORDER BY d.fecha`,
    parametros,
  );
  return rows.map((r) => ({
    fecha: fechaISO(r.fecha),
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
        WHERE r.estado IN ${COBRADAS}
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
     SELECT d.fecha, COALESCE(r.monto, 0) AS reservas, COALESCE(a.monto, 0) AS abonos
       FROM dias d
       LEFT JOIN reservas r ON r.fecha = d.fecha
       LEFT JOIN abonos a ON a.fecha = d.fecha
      ORDER BY d.fecha`,
    parametros,
  );
  return rows.map((r) => ({ fecha: fechaISO(r.fecha), reservas: numero(r.reservas), abonos: numero(r.abonos) }));
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
              FILTER (WHERE estado = 'CANCELADA' AND cancelada_por = 'CONDUCTOR' AND cancelada_en IS NOT NULL)
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

async function periodo(idPropietario, desde, hasta, idEstacionamiento) {
  const parametros = [idPropietario, desde, hasta, idEstacionamiento ?? null];
  const [horas, ingresos, totales] = await Promise.all([
    horasPorDia(parametros),
    ingresosPorDia(parametros),
    conteos(parametros),
  ]);
  return { parametros, horas, ingresos, totales };
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
    periodo(idPropietario, desde, hasta, idEstacionamiento),
    periodo(idPropietario, previo.desde, previo.hasta, idEstacionamiento),
  ]);
  const celdas = await demanda(actual.parametros);

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
