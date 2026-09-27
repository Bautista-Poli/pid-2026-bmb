import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reserva } from '@app/models';
import { reservaEnJuego } from './ciclo-reserva';

const reserva = (datos: Partial<Reserva>) =>
  ({ estado: 'CONFIRMADA', modalidad: 'HORA', ...datos }) as Reserva;

const jornada = reserva({
  modalidad: 'JORNADA',
  fecha: '2026-09-14',
  horaDesde: '08:00',
  fechaHasta: '2026-09-15',
  horaHasta: '08:00',
});

const estadia = reserva({
  modalidad: 'ESTADIA',
  fecha: '2026-09-14',
  horaDesde: '18:00',
  fechaHasta: '2026-09-15',
  horaHasta: '06:00',
});

describe('reservaEnJuego', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const ahora = (instante: string) => vi.setSystemTime(new Date(instante));

  it('una jornada que cruza la medianoche esta en juego a mitad del dia', () => {
    ahora('2026-09-14T12:00:00-03:00');
    expect(reservaEnJuego(jornada)).toBe(true);
  });

  it('una estadia esta en juego de noche y pasada la medianoche', () => {
    ahora('2026-09-14T20:00:00-03:00');
    expect(reservaEnJuego(estadia)).toBe(true);
    ahora('2026-09-15T02:00:00-03:00');
    expect(reservaEnJuego(estadia)).toBe(true);
  });

  it('la estadia ya no esta en juego despues de su fin', () => {
    ahora('2026-09-15T07:00:00-03:00');
    expect(reservaEnJuego(estadia)).toBe(false);
  });

  it('una reserva cancelada nunca esta en juego', () => {
    ahora('2026-09-14T12:00:00-03:00');
    expect(reservaEnJuego({ ...jornada, estado: 'CANCELADA' })).toBe(false);
  });

  it('una reserva por hora del mismo dia se comporta como siempre', () => {
    const porHora = reserva({
      fecha: '2026-09-14',
      horaDesde: '10:00',
      fechaHasta: '2026-09-14',
      horaHasta: '12:00',
    });
    ahora('2026-09-14T11:00:00-03:00');
    expect(reservaEnJuego(porHora)).toBe(true);
    ahora('2026-09-14T13:00:00-03:00');
    expect(reservaEnJuego(porHora)).toBe(false);
  });
});
