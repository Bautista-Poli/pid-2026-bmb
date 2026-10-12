import { FechaISO } from '@app/models';

export type TipoPeriodo = '7D' | '30D' | 'MES' | 'MES_ANTERIOR';

export const PERIODOS: { tipo: TipoPeriodo; etiqueta: string }[] = [
  { tipo: '7D', etiqueta: 'Últimos 7 días' },
  { tipo: '30D', etiqueta: 'Últimos 30 días' },
  { tipo: 'MES', etiqueta: 'Este mes' },
  { tipo: 'MES_ANTERIOR', etiqueta: 'Mes anterior' },
];

const DIA = 86_400_000;
/** Argentina es UTC-3 todo el año (igual que el back, utils/horario.js). */
const DESFASE_AR = 3 * 3_600_000;

/** Dia y hora de Buenos Aires leidos con los getters UTC de este Date. */
const enArgentina = (fecha: Date) => new Date(fecha.getTime() - DESFASE_AR);
const iso = (fecha: Date): FechaISO => fecha.toISOString().slice(0, 10);

/** El rango de dias (locales, inclusive) de cada periodo del dashboard. */
export function rangoDePeriodo(tipo: TipoPeriodo, hoy = new Date()): { desde: FechaISO; hasta: FechaISO } {
  const local = enArgentina(hoy);
  const anio = local.getUTCFullYear();
  const mes = local.getUTCMonth();

  switch (tipo) {
    case '7D':
      return { desde: iso(new Date(local.getTime() - 6 * DIA)), hasta: iso(local) };
    case '30D':
      return { desde: iso(new Date(local.getTime() - 29 * DIA)), hasta: iso(local) };
    case 'MES':
      return { desde: iso(new Date(Date.UTC(anio, mes, 1))), hasta: iso(local) };
    case 'MES_ANTERIOR':
      // Date.UTC normaliza el mes -1 al diciembre anterior; el dia 0 es el ultimo del mes previo.
      return { desde: iso(new Date(Date.UTC(anio, mes - 1, 1))), hasta: iso(new Date(Date.UTC(anio, mes, 0))) };
  }
}

export interface Variacion {
  /** `true` = mejoro, `false` = empeoro, `null` = sin cambio o sin comparacion. */
  sube: boolean | null;
  texto: string;
}

/**
 * Comparacion contra el periodo anterior. `sube` dice si es una buena noticia:
 * en las tasas de cancelacion o ausentes, bajar es mejorar (`menosEsMejor`).
 */
export function variacion(valor: number, anterior: number, { menosEsMejor = false } = {}): Variacion {
  if (anterior === 0) return { sube: null, texto: '—' };
  const porcentaje = Math.round(((valor - anterior) / anterior) * 100);
  if (porcentaje === 0) return { sube: null, texto: 'Igual que el período anterior' };

  const signo = porcentaje > 0 ? '+' : '−';
  return {
    sube: menosEsMejor ? porcentaje < 0 : porcentaje > 0,
    texto: `${signo}${Math.abs(porcentaje)} % vs. período anterior`,
  };
}
