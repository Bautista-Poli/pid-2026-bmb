import { distanciaKm, minutosAPie } from './distancia.util';

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

describe('minutosAPie', () => {
  it('estima a ~80 m por minuto y nunca da 0', () => {
    expect(minutosAPie(0.4)).toBe(5);
    expect(minutosAPie(1.2)).toBe(15);
    expect(minutosAPie(0.01)).toBe(1);
  });
});
