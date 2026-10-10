import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reserva } from '@app/models';
import { avanzarReserva, ingresoHabilitado, puedeAvanzar, reservaEnJuego } from './ciclo-reserva';

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

describe('ingreso por franja', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const ahora = (instante: string) => vi.setSystemTime(new Date(instante));

  const porHora = reserva({
    estado: 'CONFIRMADA',
    fecha: '2026-09-14',
    horaDesde: '10:00',
    fechaHasta: '2026-09-14',
    horaHasta: '12:00',
  });

  it('se habilita desde 30 min antes del inicio', () => {
    ahora('2026-09-14T09:29:00-03:00');
    expect(ingresoHabilitado(porHora)).toBe(false);
    ahora('2026-09-14T09:30:00-03:00');
    expect(ingresoHabilitado(porHora)).toBe(true);
  });

  it('se cierra al llegar al fin de la franja', () => {
    ahora('2026-09-14T11:59:59-03:00');
    expect(ingresoHabilitado(porHora)).toBe(true);
    ahora('2026-09-14T12:00:00-03:00');
    expect(ingresoHabilitado(porHora)).toBe(false);
  });

  it('una reserva vieja nunca habilita el ingreso', () => {
    ahora('2026-10-08T12:00:00-03:00');
    expect(ingresoHabilitado(porHora)).toBe(false);
    expect(puedeAvanzar(porHora)).toBe(false);
  });

  it('el resto de los pasos no depende de la ventana', () => {
    ahora('2026-10-08T12:00:00-03:00');
    expect(puedeAvanzar({ ...porHora, estado: 'PENDIENTE' })).toBe(true);
    expect(puedeAvanzar({ ...porHora, estado: 'ACTIVA' })).toBe(true);
  });

  it('avanzarReserva no ofrece el ingreso fuera de la ventana', () => {
    ahora('2026-10-08T12:00:00-03:00');
    const servicio = { registrarIngreso: vi.fn() } as never;
    const paso = avanzarReserva(servicio, { ...porHora, vehiculo: { patente: 'AB 123 CD' } } as never);
    expect(paso).toBeNull();
  });
});
