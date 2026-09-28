import { DiaSemana, FranjaAtencion } from '@app/models';
import { DIAS_POR_NUMERO } from './fecha.util';

/** Lunes primero, como se lee un horario. */
const SEMANA: DiaSemana[] = [
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
  'DOMINGO',
];

const ABREVIATURA: Record<DiaSemana, string> = {
  LUNES: 'Lun',
  MARTES: 'Mar',
  MIERCOLES: 'Mié',
  JUEVES: 'Jue',
  VIERNES: 'Vie',
  SABADO: 'Sáb',
  DOMINGO: 'Dom',
};

const esTodoElDia = (franja: FranjaAtencion) =>
  franja.desde === '00:00' && (franja.hasta === '23:59' || franja.hasta === '24:00');

const textoFranja = (franja: FranjaAtencion | undefined) =>
  !franja ? 'Cerrado' : esTodoElDia(franja) ? '24 h' : `${franja.desde} – ${franja.hasta}`;

export interface EstadoApertura {
  abierto: boolean;
  /** "Abierto · Cierra 23:00", "Cerrado · Abre 08:00", "Abierto las 24 h", "Cerrado hoy". */
  texto: string;
}

/** Si esta abierto en este momento y hasta cuando (o cuando abre hoy). */
export function estadoApertura(horarios: FranjaAtencion[], ahora: Date = new Date()): EstadoApertura {
  const hoy = DIAS_POR_NUMERO[ahora.getDay()];
  const franja = horarios.find((h) => h.dia === hoy);
  if (!franja) return { abierto: false, texto: 'Cerrado hoy' };
  if (esTodoElDia(franja)) return { abierto: true, texto: 'Abierto las 24 h' };

  const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  if (hora < franja.desde) return { abierto: false, texto: `Cerrado · Abre ${franja.desde}` };
  if (hora >= franja.hasta) return { abierto: false, texto: 'Cerrado por hoy' };
  return { abierto: true, texto: `Abierto · Cierra ${franja.hasta}` };
}

/**
 * La semana agrupando los dias seguidos con el mismo horario:
 * ["Lun a Vie · 08:00 – 20:00", "Sáb · 09:00 – 13:00", "Dom · Cerrado"].
 */
export function resumenSemana(horarios: FranjaAtencion[]): string[] {
  if (horarios.length === 0) return ['Sin horario cargado'];

  const grupos: { desde: DiaSemana; hasta: DiaSemana; texto: string }[] = [];
  for (const dia of SEMANA) {
    const texto = textoFranja(horarios.find((h) => h.dia === dia));
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.texto === texto) ultimo.hasta = dia;
    else grupos.push({ desde: dia, hasta: dia, texto });
  }

  if (grupos.length === 1) return [`Todos los días · ${grupos[0].texto}`];
  return grupos.map(({ desde, hasta, texto }) => {
    const dias = desde === hasta ? ABREVIATURA[desde] : `${ABREVIATURA[desde]} a ${ABREVIATURA[hasta]}`;
    return `${dias} · ${texto}`;
  });
}
