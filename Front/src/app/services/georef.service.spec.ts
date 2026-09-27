import { filtrarLugares, nombrePropio, normalizar } from './georef.service';

const lugares = (...nombres: string[]) => nombres.map((nombre, i) => ({ id: String(i), nombre }));

describe('normalizar', () => {
  it('saca acentos, la ñ y la puntuacion', () => {
    expect(normalizar('Bv. Oroño')).toBe('bv orono');
    expect(normalizar('  Ciudad Autónoma  de Buenos Aires ')).toBe('ciudad autonoma de buenos aires');
  });
});

describe('nombrePropio', () => {
  it('pasa las mayusculas de Georef a nombre propio', () => {
    expect(nombrePropio('AV CORRIENTES')).toBe('Av Corrientes');
    expect(nombrePropio('25 DE MAYO')).toBe('25 de Mayo');
  });
});

describe('filtrarLugares', () => {
  const calles = lugares('Corrales', 'Correa', 'Av Corrientes', 'Colonia Anita', 'Av Colon', 'Bv Orono');

  it('encuentra por el principio de cualquier palabra', () => {
    expect(filtrarLugares(calles, 'corri').map((c) => c.nombre)).toEqual(['Av Corrientes']);
    expect(filtrarLugares(calles, 'av corr').map((c) => c.nombre)).toEqual(['Av Corrientes']);
  });

  it('ignora acentos y la ñ', () => {
    expect(filtrarLugares(calles, 'Oroño').map((c) => c.nombre)).toEqual(['Bv Orono']);
    expect(filtrarLugares(calles, 'colón').map((c) => c.nombre)).toEqual(['Av Colon', 'Colonia Anita']);
  });

  it('no cuenta el tipo de via para ordenar', () => {
    expect(filtrarLugares(calles, 'corr').map((c) => c.nombre)).toEqual([
      'Corrales',
      'Correa',
      'Av Corrientes',
    ]);
  });

  it('no devuelve nada sin texto ni mas del maximo', () => {
    expect(filtrarLugares(calles, '  ')).toEqual([]);
    expect(filtrarLugares(calles, 'c', 2)).toHaveLength(2);
  });
});
