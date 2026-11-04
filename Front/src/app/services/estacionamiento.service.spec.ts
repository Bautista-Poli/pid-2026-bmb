import { Estacionamiento, REPUTACION_VACIA } from '@app/models';
import { ordenarEstacionamientos } from './estacionamiento.service';

/** Lo minimo que miran los comparadores y la disponibilidad. */
function est(
  id: string,
  { puntaje = 0, distanciaKm = 1, disponible = true, destacado = false } = {},
): Estacionamiento {
  return {
    id,
    distanciaKm,
    disponible,
    cocherasDisponibles: disponible ? 10 : 0,
    tarifas: { hora: 1000, estadia: null, jornada: null },
    reputacion: { ...REPUTACION_VACIA, puntaje, destacado },
  } as unknown as Estacionamiento;
}

const ids = (lista: Estacionamiento[]) => lista.map((e) => e.id);

describe('ordenarEstacionamientos', () => {
  it('Mejor calificados: el mayor puntaje primero', () => {
    const lista = [est('a', { puntaje: 60 }), est('b', { puntaje: 90 }), est('c', { puntaje: 75 })];
    expect(ids(ordenarEstacionamientos(lista, 'REPUTACION'))).toEqual(['b', 'c', 'a']);
  });

  it('Mejor calificados: con el mismo puntaje, el mas cercano primero', () => {
    const lista = [est('lejos', { puntaje: 80, distanciaKm: 5 }), est('cerca', { puntaje: 80, distanciaKm: 1 })];
    expect(ids(ordenarEstacionamientos(lista, 'REPUTACION'))).toEqual(['cerca', 'lejos']);
  });

  it('Mejor calificados: uno no disponible va al final aunque tenga mejor puntaje', () => {
    const lista = [est('lleno', { puntaje: 90, disponible: false }), est('libre', { puntaje: 60 })];
    expect(ids(ordenarEstacionamientos(lista, 'REPUTACION'))).toEqual(['libre', 'lleno']);
  });

  it('Cercania sigue poniendo primero al destacado', () => {
    const lista = [est('cerca', { distanciaKm: 1 }), est('destacado', { distanciaKm: 9, destacado: true })];
    expect(ids(ordenarEstacionamientos(lista, 'DISTANCIA'))).toEqual(['destacado', 'cerca']);
  });
});
