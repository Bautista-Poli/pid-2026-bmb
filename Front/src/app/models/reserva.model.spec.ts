import { describe, expect, it } from 'vitest';
import { esVencida, etiquetaReserva } from './reserva.model';

describe('etiquetaReserva', () => {
  it('un no-show se ve como Ausente', () => {
    expect(etiquetaReserva({ estado: 'NO_SHOW', canceladaPor: null })).toBe('Ausente');
  });

  it('una pendiente que el sistema cancelo se ve como Vencida', () => {
    const vencida = { estado: 'CANCELADA', canceladaPor: 'SISTEMA' } as const;
    expect(etiquetaReserva(vencida)).toBe('Vencida');
    expect(etiquetaReserva(vencida, 'CONDUCTOR')).toBe('Vencida');
    expect(esVencida(vencida)).toBe(true);
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
    expect(esVencida({ estado: 'CANCELADA', canceladaPor: null })).toBe(false);
  });

  it('el resto de los estados no cambia', () => {
    expect(etiquetaReserva({ estado: 'ACTIVA', canceladaPor: null })).toBe('En curso');
  });
});
