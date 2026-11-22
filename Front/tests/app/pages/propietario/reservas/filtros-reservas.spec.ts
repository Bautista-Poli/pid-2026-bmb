import { describe, expect, it } from 'vitest';
import { ReservaDetallada } from '@app/models';
import { SIN_FILTRO, filtrarReservas } from '@app/pages/propietario/reservas/filtros-reservas/filtros-reservas';

const reserva = (datos: Partial<ReservaDetallada>) =>
  ({
    estado: 'CONFIRMADA',
    fecha: '2026-11-20',
    horaDesde: '10:00',
    estacionamientoId: 'e1',
    estacionamiento: { nombre: 'Garage Centro' },
    vehiculo: { patente: 'AB 123 CD', marca: 'Toyota', modelo: 'Corolla' },
    cochera: { identificador: 'PB-1' },
    ...datos,
  }) as ReservaDetallada;

describe('filtrarReservas', () => {
  it('sin filtro oculta las canceladas y ordena de la mas reciente a la mas vieja', () => {
    const lista = [
      reserva({ id: 'vieja', fecha: '2026-11-18' }),
      reserva({ id: 'cancelada', estado: 'CANCELADA' }),
      reserva({ id: 'tarde', fecha: '2026-11-20', horaDesde: '18:00' }),
      reserva({ id: 'temprano', fecha: '2026-11-20', horaDesde: '08:00' }),
    ];
    expect(filtrarReservas(lista, SIN_FILTRO).map((r) => r.id)).toEqual(['temprano', 'tarde', 'vieja']);
  });

  it('muestra las canceladas si se piden', () => {
    const lista = [reserva({ id: 'cancelada', estado: 'CANCELADA' })];
    expect(filtrarReservas(lista, { ...SIN_FILTRO, verCanceladas: true })).toHaveLength(1);
  });

  it('busca por patente, vehiculo, estacionamiento o cochera, sin importar acentos ni mayusculas', () => {
    const lista = [
      reserva({ id: 'a' }),
      reserva({ id: 'b', estacionamiento: { nombre: 'Estación Güemes' } as never, vehiculo: { patente: 'ZZ 999 ZZ' } as never }),
    ];
    const buscar = (busqueda: string) => filtrarReservas(lista, { ...SIN_FILTRO, busqueda }).map((r) => r.id);
    expect(buscar('ab 123')).toEqual(['a']);
    expect(buscar('corolla')).toEqual(['a']);
    expect(buscar('estacion guemes')).toEqual(['b']);
    expect(buscar('pb-1')).toEqual(['a', 'b']);
  });

  it('filtra por fecha y por estacionamiento', () => {
    const lista = [reserva({ id: 'a' }), reserva({ id: 'b', fecha: '2026-11-21', estacionamientoId: 'e2' })];
    expect(filtrarReservas(lista, { ...SIN_FILTRO, fecha: '2026-11-21' }).map((r) => r.id)).toEqual(['b']);
    expect(filtrarReservas(lista, { ...SIN_FILTRO, estacionamientoId: 'e1' }).map((r) => r.id)).toEqual(['a']);
  });
});
