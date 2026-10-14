import { describe, expect, it } from 'vitest';
import { Abono, ReservaDetallada } from '@app/models';
import { abonoReclamable, puedeReclamar, reservaReclamable } from './reclamo.util';

const ahora = new Date('2026-10-20T12:00:00-03:00');
const haceDias = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000).toISOString();

describe('puedeReclamar', () => {
  it('hasta 15 dias despues del fin, y siempre si todavia no termino', () => {
    expect(puedeReclamar(haceDias(14), ahora)).toBe(true);
    expect(puedeReclamar(haceDias(16), ahora)).toBe(false);
    expect(puedeReclamar(haceDias(-3), ahora)).toBe(true);
  });
});

describe('reservaReclamable', () => {
  const reserva = {
    estado: 'FINALIZADA',
    abono: null,
    reclamoAbierto: null,
    fechaHasta: '2026-10-18',
    horaHasta: '12:00',
  } as unknown as ReservaDetallada;

  it('una finalizada reciente, pagada aparte y sin reclamo abierto', () => {
    expect(reservaReclamable(reserva, ahora)).toBe(true);
  });

  it('no si es de abono, si ya tiene reclamo, si esta pendiente o vieja', () => {
    expect(reservaReclamable({ ...reserva, abono: { id: 'a', turno: 'MANANA' } }, ahora)).toBe(false);
    expect(reservaReclamable({ ...reserva, reclamoAbierto: 'i1' }, ahora)).toBe(false);
    expect(reservaReclamable({ ...reserva, estado: 'PENDIENTE' }, ahora)).toBe(false);
    expect(reservaReclamable({ ...reserva, fechaHasta: '2026-10-01' }, ahora)).toBe(false);
  });
});

describe('abonoReclamable', () => {
  const abono = { hasta: '2026-10-10', reclamoAbierto: null } as unknown as Abono;

  it('hasta 15 dias despues de su ultimo dia y sin reclamo abierto', () => {
    expect(abonoReclamable(abono, ahora)).toBe(true);
    expect(abonoReclamable({ ...abono, hasta: '2026-10-01' }, ahora)).toBe(false);
    expect(abonoReclamable({ ...abono, reclamoAbierto: 'i1' }, ahora)).toBe(false);
  });
});
