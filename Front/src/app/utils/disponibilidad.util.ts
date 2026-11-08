import { DiaSemana, Estacionamiento, FranjaAtencion, HoraHHmm } from '@app/models';
import { diaSemanaDe, hoyISO } from './fecha.util';

/** Horario de hoy: `07 – 23 h`, `24 h` si no cierra, o `Cerrado hoy`. */
export function resumenHorario(
  horarios: FranjaAtencion[],
  hoy: DiaSemana = diaSemanaDe(hoyISO()),
): string {
  if (horarios.length === 0) return 'Sin horario';

  const franja = horarios.find((h) => h.dia === hoy);
  if (!franja) return 'Cerrado hoy';
  if (esJornadaCompleta(franja.desde, franja.hasta)) return '24 h';
  return `${franja.desde.slice(0, 2)} – ${franja.hasta.slice(0, 2)} h`;
}

function esJornadaCompleta(desde: HoraHHmm, hasta: HoraHHmm): boolean {
  return desde === '00:00' && (hasta === '23:59' || hasta === '24:00');
}

/** `350 m` para distancias cortas, `1,2 km` para el resto. */
export function formatearDistancia(km: number | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`;
}

/** Estado para el mapa y su leyenda: 0 libres, de 1 a 4 libres, 5 o mas. */
export type EstadoDisponibilidad = 'DISPONIBLE' | 'POCA' | 'NO_DISPONIBLE';

export const ETIQUETA_ESTADO: Record<EstadoDisponibilidad, string> = {
  DISPONIBLE: 'Disponible',
  POCA: 'Poca disponibilidad',
  NO_DISPONIBLE: 'No disponible',
};

/**
 * No disponible: sin cocheras libres ahora o, si la busqueda lo informa, sin cochera para
 * el vehiculo o cerrado en el momento buscado. Si `disponible` vino en true
 * (p. ej. una franja futura), cuenta como disponible aunque hoy este lleno.
 */
export function estadoDisponibilidad(
  estacionamiento: Pick<Estacionamiento, 'cocherasDisponibles' | 'disponible'>,
): EstadoDisponibilidad {
  const { cocherasDisponibles: libres, disponible } = estacionamiento;
  if (disponible === false || (disponible === undefined && libres === 0)) return 'NO_DISPONIBLE';
  return libres < 5 ? 'POCA' : 'DISPONIBLE';
}
