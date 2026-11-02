import { describe, expect, it } from 'vitest';
import { Estacionamiento } from '@app/models';
import { ordenarEstacionamientos } from './estacionamiento.service';

const est = (
  id: string,
  puntajeOrden: number,
  cantidad: number,
  distanciaKm: number,
  disponible?: boolean,
): Estacionamiento =>
  ({
    id,
    puntajeOrden,
    reputacion: { promedio: cantidad ? puntajeOrden : null, cantidad },
    distanciaKm,
    disponible,
    cocherasDisponibles: 3,
    tarifas: { hora: 1000, estadia: null, jornada: null },
  }) as unknown as Estacionamiento;

const ids = (items: Estacionamiento[]) => items.map((e) => e.id);

describe('ordenarEstacionamientos por calificacion', () => {
  it('mayor puntaje primero', () => {
    const lista = [est('a', 3.5, 4, 1), est('b', 4.7, 40, 5), est('c', 4.1, 2, 2)];
    expect(ids(ordenarEstacionamientos(lista, 'CALIFICACION'))).toEqual(['b', 'c', 'a']);
  });

  it('a igual puntaje, mas calificaciones y despues mas cerca', () => {
    const lista = [est('a', 4, 3, 1), est('b', 4, 10, 9), est('c', 4, 3, 0.5)];
    expect(ids(ordenarEstacionamientos(lista, 'CALIFICACION'))).toEqual(['b', 'c', 'a']);
  });

  it('los no disponibles siguen al final', () => {
    const lista = [est('a', 5, 50, 1, false), est('b', 3, 1, 1)];
    expect(ids(ordenarEstacionamientos(lista, 'CALIFICACION'))).toEqual(['b', 'a']);
  });
});
