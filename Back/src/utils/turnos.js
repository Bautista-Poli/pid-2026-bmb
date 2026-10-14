// Turnos de los abonos. Funciones puras: sin base ni red.
// El horario de cada turno es un supuesto de la spec (pregunta 1); el front
// tiene el espejo en Front/src/app/models/abono.model.ts.
import { partesLocales, sumarDias } from './horario.js';

export const TURNOS = Object.freeze({
  MANANA: Object.freeze({ etiqueta: 'manana', desde: '06:00', hasta: '12:00' }),
  TARDE: Object.freeze({ etiqueta: 'tarde', desde: '12:00', hasta: '18:00' }),
  NOCHE: Object.freeze({ etiqueta: 'noche', desde: '18:00', hasta: '24:00' }),
});

export const NOMBRES_TURNO = Object.freeze(Object.keys(TURNOS));

/**
 * Motivo por el que [inicio, fin) no cae dentro del turno, o null si cae.
 * Las horas se comparan como texto 'HH:MM' en hora argentina; un fin justo a
 * la medianoche cuenta como '24:00' del mismo dia (el borde de la noche).
 */
export function motivoFueraDeTurno(turno, inicio, fin) {
  const t = TURNOS[turno];
  const desde = partesLocales(inicio);
  const hasta = partesLocales(fin);

  const finEsMedianoche = hasta.hora === '00:00' && hasta.fecha === sumarDias(desde.fecha, 1);
  if (hasta.fecha !== desde.fecha && !finEsMedianoche) {
    return 'La reserva con abono tiene que empezar y terminar el mismo dia';
  }

  const horaHasta = finEsMedianoche ? '24:00' : hasta.hora;
  if (desde.hora < t.desde || horaHasta > t.hasta) {
    return `La reserva tiene que estar dentro del turno ${t.etiqueta} (${t.desde} a ${t.hasta})`;
  }
  return null;
}
