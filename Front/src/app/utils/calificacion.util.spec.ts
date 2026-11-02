import { describe, expect, it } from 'vitest';
import { Reserva } from '@app/models';
import { puedeCalificar, textoReputacion } from './calificacion.util';

describe('textoReputacion', () => {
  it('promedio con un decimal y cantidad', () => {
    expect(textoReputacion({ promedio: 4.56, cantidad: 37 }, 'Nuevo')).toBe('4.6★ (37)');
    expect(textoReputacion({ promedio: 4, cantidad: 2 }, 'Nuevo')).toBe('4.0★ (2)');
  });

  it('sin calificaciones muestra el texto pedido', () => {
    expect(textoReputacion({ promedio: null, cantidad: 0 }, 'Nuevo')).toBe('Nuevo');
    expect(textoReputacion({ promedio: null, cantidad: 0 }, 'Sin calificaciones')).toBe('Sin calificaciones');
  });
});

describe('puedeCalificar', () => {
  const ahora = new Date('2026-11-02T12:00:00-03:00');
  const reserva = {
    estado: 'FINALIZADA',
    calificacion: {
      conductorCalifico: false,
      propietarioCalifico: false,
      calificableHasta: '2026-11-10T12:00:00-03:00',
    },
  } as unknown as Reserva;
  const con = (cambios: Partial<Reserva>, calificacion: Partial<Reserva['calificacion']> = {}) =>
    ({ ...reserva, ...cambios, calificacion: { ...reserva.calificacion, ...calificacion } }) as Reserva;

  it('una finalizada sin calificar y en plazo, para los dos lados', () => {
    expect(puedeCalificar(reserva, 'CONDUCTOR', ahora)).toBe(true);
    expect(puedeCalificar(reserva, 'PROPIETARIO', ahora)).toBe(true);
  });

  it('no si ese lado ya califico', () => {
    expect(puedeCalificar(con({}, { conductorCalifico: true }), 'CONDUCTOR', ahora)).toBe(false);
    expect(puedeCalificar(con({}, { conductorCalifico: true }), 'PROPIETARIO', ahora)).toBe(true);
    expect(puedeCalificar(con({}, { propietarioCalifico: true }), 'PROPIETARIO', ahora)).toBe(false);
  });

  it('no si paso el plazo', () => {
    expect(puedeCalificar(con({}, { calificableHasta: '2026-11-01T12:00:00-03:00' }), 'CONDUCTOR', ahora)).toBe(false);
  });

  it('un ausente solo lo califica el propietario', () => {
    expect(puedeCalificar(con({ estado: 'NO_SHOW' }), 'CONDUCTOR', ahora)).toBe(false);
    expect(puedeCalificar(con({ estado: 'NO_SHOW' }), 'PROPIETARIO', ahora)).toBe(true);
  });

  it('una reserva que no termino no se califica', () => {
    expect(puedeCalificar(con({ estado: 'CONFIRMADA' }, { calificableHasta: null }), 'CONDUCTOR', ahora)).toBe(false);
  });
});
