// Cuentas en JS sobre lo que devuelven las consultas: numeros, tasas, KPIs y el
// periodo anterior. No toca la base.

const DIA = 86_400_000;

/** Convierte a numero; null/undefined cuentan como 0. */
export const numero = (valor) => Number(valor ?? 0);
/** Redondea a `decimales`. */
export const redondear = (valor, decimales = 2) => Math.round(valor * 10 ** decimales) / 10 ** decimales;

/** parte / total con 4 decimales; 0 si no hay total. */
export const tasa = (parte, total) => (total > 0 ? redondear(parte / total, 4) : 0);

/** Los KPIs de un periodo (se usan tambien para el periodo anterior). */
export function kpisDe({ horas, ingresos, totales }) {
  const usadas = horas.reduce((suma, d) => suma + d.horasUsadas, 0);
  const ofrecidas = horas.reduce((suma, d) => suma + d.horasOfrecidas, 0);
  return {
    ocupacion: ofrecidas > 0 ? usadas / ofrecidas : 0,
    // Netos: lo devuelto por reclamos se descuenta el dia en que se devolvio.
    ingresos: ingresos.reduce((suma, d) => suma + d.reservas + d.abonos - d.devoluciones, 0),
    devoluciones: ingresos.reduce((suma, d) => suma + d.devoluciones, 0),
    reservas: totales.total,
    tasaCancelacion: tasa(totales.canceladas, totales.total),
    ausentes: totales.ausentes,
  };
}

/** El periodo inmediatamente anterior, del mismo largo. */
export function anteriorA(desde, hasta) {
  const largo = (Date.parse(hasta) - Date.parse(desde)) / DIA + 1;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  return { desde: iso(Date.parse(desde) - largo * DIA), hasta: iso(Date.parse(desde) - DIA) };
}
