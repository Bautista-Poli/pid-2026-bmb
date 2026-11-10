import { ID_CABA, PROVINCIAS, normalizar } from '@app/utils/direcciones.util';

describe('normalizar', () => {
  it('saca acentos, la ñ y la puntuacion', () => {
    expect(normalizar('Bv. Oroño')).toBe('bv orono');
    expect(normalizar('  Ciudad Autónoma  de Buenos Aires ')).toBe('ciudad autonoma de buenos aires');
  });
});

describe('PROVINCIAS', () => {
  it('son las 24 e incluyen CABA', () => {
    expect(PROVINCIAS.length).toBe(24);
    expect(PROVINCIAS.find((p) => p.id === ID_CABA)?.nombre).toBe('Ciudad Autónoma de Buenos Aires');
  });
});
