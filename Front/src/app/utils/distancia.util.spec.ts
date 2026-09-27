import { distanciaHasta, distanciaKm, porCercania } from './distancia.util';

const OBELISCO = { latitud: -34.603722, longitud: -58.381592 };
const CONGRESO = { latitud: -34.609722, longitud: -58.392222 };

describe('distanciaKm', () => {
  it('es 0 para el mismo punto', () => {
    expect(distanciaKm(OBELISCO, OBELISCO)).toBe(0);
  });

  it('Obelisco -> Congreso da ~1,18 km', () => {
    expect(distanciaKm(OBELISCO, CONGRESO)).toBeCloseTo(1.18, 2);
  });

  it('es simetrica', () => {
    expect(distanciaKm(OBELISCO, CONGRESO)).toBeCloseTo(distanciaKm(CONGRESO, OBELISCO), 10);
  });
});

describe('distanciaHasta', () => {
  it('sin ubicacion del usuario no hay distancia', () => {
    expect(distanciaHasta(null, CONGRESO)).toBeUndefined();
  });

  it('sin coordenadas del estacionamiento no hay distancia', () => {
    expect(distanciaHasta(OBELISCO, { latitud: null, longitud: null })).toBeUndefined();
  });

  it('con ambos puntos calcula la distancia', () => {
    expect(distanciaHasta(OBELISCO, CONGRESO)).toBeCloseTo(1.18, 2);
  });
});

describe('porCercania', () => {
  it('ordena del mas cercano al mas lejano y deja al final los que no tienen distancia', () => {
    const lista = [
      { id: 'lejos', distanciaKm: 5 },
      { id: 'sin-dato' },
      { id: 'cerca', distanciaKm: 0.3 },
      { id: 'sin-dato-2' },
      { id: 'medio', distanciaKm: 1.2 },
    ];
    expect([...lista].sort(porCercania).map((e) => e.id)).toEqual([
      'cerca',
      'medio',
      'lejos',
      'sin-dato',
      'sin-dato-2',
    ]);
  });
});
