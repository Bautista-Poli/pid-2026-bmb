// Dashboard del propietario: KPIs del periodo contra el anterior, ocupacion por
// dia, ingresos y demanda por franja. Lo llama estadistica.controller.
//
// Estadisticas del propietario para un periodo de dias locales (hora
// argentina): ocupacion, ingresos simulados, demanda por horario,
// cancelaciones y ausentes. Todo se agrega en SQL y las consultas corren en
// paralelo: la base es Neon y cada ida y vuelta cuesta.
//
// Reglas (ver docs/.../dashboard-propietario-design.md, seccion 3):
//   - Una reserva cuenta en el periodo si su `inicio` cae en el (conteos,
//     ingresos, demanda); la ocupacion, en cambio, reparte sus horas por dia y
//     solo dentro del horario de atencion (ver VENTANAS).
//   - Ocupan la cochera PENDIENTE, CONFIRMADA, ACTIVA y FINALIZADA. NO_SHOW la
//     libera y no se cobra.
//   - Ingresos: FINALIZADA y ACTIVA (las de abono valen 0) + abonos vendidos.
//
// En esta carpeta:
//   estadistica-sql.js        pedazos de SQL compartidos (zona, estados, dias,
//                             estacionamientos, reservas, ventanas)
//   estadistica-calculos.js   numero, redondear, tasa, KPIs y periodo anterior
//   estadistica-ocupacion.js  horas usadas / ofrecidas por dia
//   estadistica-ingresos.js   ingresos por dia y lo que falta cobrar
//   estadistica-reservas.js   demanda por franja y conteos (canceladas, ausentes)
import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { anteriorA, kpisDe, numero, redondear, tasa } from './estadistica-calculos.js';
import { ingresosPorDia, porCobrar } from './estadistica-ingresos.js';
import { horasPorDia } from './estadistica-ocupacion.js';
import { conteos, demanda } from './estadistica-reservas.js';

/** 404 si el estacionamiento no es del propietario: no se confirma que exista uno ajeno. */
async function asegurarPropio(idEstacionamiento, idPropietario) {
  const { rows } = await query(
    'SELECT 1 FROM estacionamiento WHERE id_estacionamiento = $1 AND id_propietario = $2',
    [idEstacionamiento, idPropietario],
  );
  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');
}

/** Todos los numeros de un periodo para el dashboard (y, si se pide, la demanda). */
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

/** El dashboard completo del propietario: periodo actual contra el anterior. */
export async function delPropietario(idPropietario, { desde, hasta, id_estacionamiento: idEstacionamiento }) {
  if (idEstacionamiento) await asegurarPropio(idEstacionamiento, idPropietario);

  const previo = anteriorA(desde, hasta);
  const [actual, anterior, proyectados] = await Promise.all([
    periodo(idPropietario, desde, hasta, idEstacionamiento, { conDemanda: true }),
    periodo(idPropietario, previo.desde, previo.hasta, idEstacionamiento),
    porCobrar(idPropietario, idEstacionamiento),
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
    ingresosProyectados: proyectados,
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
