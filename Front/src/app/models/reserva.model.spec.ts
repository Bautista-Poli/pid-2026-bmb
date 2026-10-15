import { describe, expect, it } from 'vitest';
import { esExpirada, etiquetaReserva } from './reserva.model';

describe('etiquetaReserva', () => {
  it('un no-show se ve como Ausente', () => {
    expect(etiquetaReserva({ estado: 'NO_SHOW', canceladaPor: null })).toBe('Ausente');
  });

  it('una pendiente que el sistema cancelo se ve como Expirada', () => {
    const expirada = { estado: 'CANCELADA', canceladaPor: 'SISTEMA' } as const;
    expect(etiquetaReserva(expirada)).toBe('Expirada');
    expect(etiquetaReserva(expirada, 'CONDUCTOR')).toBe('Expirada');
    expect(esExpirada(expirada)).toBe(true);
  });

  it('el propietario ve quien cancelo', () => {
    expect(etiquetaReserva({ estado: 'CANCELADA', canceladaPor: 'CONDUCTOR' })).toBe(
      'Cancelada por el conductor',
    );
    expect(etiquetaReserva({ estado: 'CANCELADA', canceladaPor: 'PROPIETARIO' })).toBe('Cancelada por vos');
  });

  it('el conductor ve su propia cancelacion como Cancelada', () => {
    expect(etiquetaReserva({ estado: 'CANCELADA', canceladaPor: 'CONDUCTOR' }, 'CONDUCTOR')).toBe('Cancelada');
    expect(etiquetaReserva({ estado: 'CANCELADA', canceladaPor: 'PROPIETARIO' }, 'CONDUCTOR')).toBe(
      'Cancelada por el estacionamiento',
    );
  });

  it('sin origen conocido (reservas viejas) dice Cancelada', () => {
    expect(etiquetaReserva({ estado: 'CANCELADA', canceladaPor: null })).toBe('Cancelada');
    expect(esExpirada({ estado: 'CANCELADA', canceladaPor: null })).toBe(false);
  });

  it('el resto de los estados no cambia', () => {
    expect(etiquetaReserva({ estado: 'ACTIVA', canceladaPor: null })).toBe('En curso');
  });
});
