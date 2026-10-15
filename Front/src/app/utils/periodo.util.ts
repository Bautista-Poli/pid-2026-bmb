import { FechaISO } from '@app/models';

/** Periodos predefinidos de los dashboards; ademas se puede elegir un rango (RANGO). */
export type TipoPeriodo = '7D' | 'MES';

export const PERIODOS: { tipo: TipoPeriodo; etiqueta: string }[] = [
  { tipo: '7D', etiqueta: 'Últimos 7 días' },
  { tipo: 'MES', etiqueta: 'Este mes' },
];

/** Igual que el back (estadistica.validator.js): rango maximo de un pedido. */
export const MAXIMO_DIAS = 92;

const DIA = 86_400_000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
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
    case 'MES':
      return { desde: iso(new Date(Date.UTC(anio, mes, 1))), hasta: iso(local) };
  }
}

/** Una fecha YYYY-MM-DD que existe (2026-02-30 no). */
const fechaValida = (fecha: string) => {
  const instante = new Date(`${fecha}T00:00:00Z`);
  return FECHA.test(fecha) && !Number.isNaN(instante.getTime()) && iso(instante) === fecha;
};

/** Por que un rango personalizado no sirve, o null si esta bien. */
export function errorDeRango(desde: string, hasta: string): string | null {
  if (!fechaValida(desde) || !fechaValida(hasta)) return 'Elegí las dos fechas';
  if (desde > hasta) return 'La fecha "desde" tiene que ser anterior a "hasta"';
  const dias = (Date.parse(hasta) - Date.parse(desde)) / DIA + 1;
  if (dias > MAXIMO_DIAS) return `El rango puede ser de hasta ${MAXIMO_DIAS} días`;
  return null;
}

export interface PeriodoElegido {
  /** RANGO: fechas elegidas a mano (`?desde=&hasta=`). */
  tipo: TipoPeriodo | 'RANGO';
  desde: FechaISO;
  hasta: FechaISO;
}

/**
 * El periodo de la URL: un rango valido (`?desde=&hasta=`) gana; si no, un
 * periodo predefinido (`?periodo=`); si no hay nada (o es uno viejo), este mes.
 */
export function periodoDeUrl(
  params: { periodo?: string | null; desde?: string | null; hasta?: string | null },
  hoy = new Date(),
): PeriodoElegido {
  const { periodo, desde, hasta } = params;
  if (desde && hasta && !errorDeRango(desde, hasta)) return { tipo: 'RANGO', desde, hasta };
  const tipo = PERIODOS.some((p) => p.tipo === periodo) ? (periodo as TipoPeriodo) : 'MES';
  return { tipo, ...rangoDePeriodo(tipo, hoy) };
}

export interface Variacion {
  /** `true` = mejoro, `false` = empeoro, `null` = sin cambio o sin comparacion. */
  sube: boolean | null;
  texto: string;
}

/**
 * Comparacion contra el periodo anterior. `sube` dice si es una buena noticia:
 * en las tasas de cancelacion o ausentes, bajar es mejorar (`menosEsMejor`).
 * Las tasas (de 0 a 1) se comparan en puntos porcentuales (`puntos`): de 40 %
 * a 50 % es "+10 pp", no "+25 %".
 */
export function variacion(
  valor: number,
  anterior: number,
  { menosEsMejor = false, puntos = false } = {},
): Variacion {
  if (!puntos && anterior === 0) return { sube: null, texto: '—' };
  const cambio = Math.round(puntos ? (valor - anterior) * 100 : ((valor - anterior) / anterior) * 100);
  if (cambio === 0) return { sube: null, texto: 'Igual que el período anterior' };

  const signo = cambio > 0 ? '+' : '−';
  return {
    sube: menosEsMejor ? cambio < 0 : cambio > 0,
    texto: `${signo}${Math.abs(cambio)} ${puntos ? 'pp' : '%'} vs. período anterior`,
  };
}
