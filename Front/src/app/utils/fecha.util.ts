import { DiaSemana, FechaHoraISO, FechaISO, HoraHHmm } from '@app/models';

/** Indice 0 = domingo, igual que `Date.getDay()` y que `horario.dia_semana` en la base. */
export const DIAS_POR_NUMERO: DiaSemana[] = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
];

/** Argentina no tiene horario de verano: el offset es fijo. */
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
const OFFSET_ARGENTINA = '-03:00';

const FORMATO_LOCAL = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `2026-09-04` a partir de un Date, sin corrimientos por zona horaria. */
export function aFechaISO(fecha: Date): FechaISO {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Interpreta `2026-09-04` como fecha local (no UTC). */
export function desdeFechaISO(fecha: FechaISO): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

export function diaSemanaDe(fecha: FechaISO): DiaSemana {
  return DIAS_POR_NUMERO[desdeFechaISO(fecha).getDay()];
}

/** `2026-09-10` + `14:00` -> `2026-09-10T14:00:00-03:00`, el instante que espera la API. */
export function aInstante(fecha: FechaISO, hora: HoraHHmm): FechaHoraISO {
  return `${fecha}T${hora}:00${OFFSET_ARGENTINA}`;
}

/** Fecha y hora de un instante de la API, vistas en hora argentina. */
export function partesLocales(instante: FechaHoraISO): { fecha: FechaISO; hora: HoraHHmm } {
  const partes: Record<string, string> = {};
  for (const { type, value } of FORMATO_LOCAL.formatToParts(new Date(instante))) {
    partes[type] = value;
  }
  return {
    fecha: `${partes['year']}-${partes['month']}-${partes['day']}`,
    hora: `${partes['hour']}:${partes['minute']}`,
  };
}

/** Los proximos `cantidad` dias a partir de hoy. */
export function proximosDias(cantidad: number, desde: Date = new Date()): Date[] {
  return Array.from({ length: cantidad }, (_, i) => {
    const fecha = new Date(desde);
    fecha.setDate(desde.getDate() + i);
    return fecha;
  });
}

export function aMinutos(hora: HoraHHmm): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** Duracion en horas entre dos horarios de la misma jornada. */
export function duracionEnHoras(desde: HoraHHmm, hasta: HoraHHmm): number {
  return Math.max(0, (aMinutos(hasta) - aMinutos(desde)) / 60);
}
