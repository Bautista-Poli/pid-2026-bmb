import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reserva } from '@app/models';
import { avanzarReserva, ingresoHabilitado, puedeAvanzar, reservaEnJuego } from './ciclo-reserva';

const reserva = (datos: Partial<Reserva>) =>
  ({ estado: 'CONFIRMADA', modalidad: 'HORA', ...datos }) as Reserva;

// Con el auto adentro (ACTIVA): una CONFIRMADA sin ingreso deja de estar en
// juego al vencer la tolerancia, y estas pruebas miran el cruce de medianoche.
const jornada = reserva({
  estado: 'ACTIVA',
  modalidad: 'JORNADA',
  fecha: '2026-09-14',
  horaDesde: '08:00',
  fechaHasta: '2026-09-15',
  horaHasta: '08:00',
});

const estadia = reserva({
  estado: 'ACTIVA',
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
      estado: 'ACTIVA',
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

  it('se cierra al vencer la tolerancia de 15 min', () => {
    ahora('2026-09-14T10:15:00-03:00');
    expect(ingresoHabilitado(porHora)).toBe(true);
    ahora('2026-09-14T10:15:01-03:00');
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

describe('tolerancia de no-show', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const ahora = (instante: string) => vi.setSystemTime(new Date(instante));

  const confirmada = reserva({
    estado: 'CONFIRMADA',
    fecha: '2026-09-14',
    horaDesde: '10:00',
    fechaHasta: '2026-09-14',
    horaHasta: '12:00',
  });

  it('una confirmada sin ingreso sigue en juego dentro de la tolerancia', () => {
    ahora('2026-09-14T10:10:00-03:00');
    expect(reservaEnJuego(confirmada)).toBe(true);
  });

  it('pasada la tolerancia deja de estar en juego aunque la franja siga', () => {
    ahora('2026-09-14T10:20:00-03:00');
    expect(reservaEnJuego(confirmada)).toBe(false);
    expect(puedeAvanzar(confirmada)).toBe(false);
  });

  it('una ACTIVA sigue en juego pasada la tolerancia', () => {
    ahora('2026-09-14T10:20:00-03:00');
    expect(reservaEnJuego({ ...confirmada, estado: 'ACTIVA' })).toBe(true);
  });

  it('una NO_SHOW nunca esta en juego', () => {
    ahora('2026-09-14T10:05:00-03:00');
    expect(reservaEnJuego({ ...confirmada, estado: 'NO_SHOW' })).toBe(false);
  });

  it('funciona como callback de filter (no toma el indice como hora)', () => {
    ahora('2026-09-14T10:10:00-03:00');
    expect([confirmada].filter(reservaEnJuego)).toHaveLength(1);
  });
});
