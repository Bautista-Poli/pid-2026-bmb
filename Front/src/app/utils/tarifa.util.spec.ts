import { Tarifas } from '@app/models';
import { calcularPrecio, modalidadesOfrecidas, resumenTarifas } from './tarifa.util';

const TODAS: Tarifas = { hora: 900, estadia: 5000, jornada: 8000 };
const SOLO_JORNADA: Tarifas = { hora: null, estadia: null, jornada: 8000 };

describe('modalidadesOfrecidas', () => {
  it('lista solo las que tienen tarifa, en orden hora, estadia, jornada', () => {
    expect(modalidadesOfrecidas(TODAS)).toEqual(['HORA', 'ESTADIA', 'JORNADA']);
    expect(modalidadesOfrecidas(SOLO_JORNADA)).toEqual(['JORNADA']);
  });

  it('una tarifa en 0 cuenta como ofrecida', () => {
    expect(modalidadesOfrecidas({ hora: 0, estadia: null, jornada: null })).toEqual(['HORA']);
  });
});

describe('calcularPrecio', () => {
  it('por hora es proporcional a las horas', () => {
    expect(calcularPrecio('HORA', TODAS, 2)).toBe(1800);
  });

  it('estadia y jornada son de precio fijo, sin importar las horas', () => {
    expect(calcularPrecio('ESTADIA', TODAS, 0)).toBe(5000);
    expect(calcularPrecio('JORNADA', TODAS, 0)).toBe(8000);
  });

  it('devuelve 0 si la modalidad no se ofrece', () => {
    expect(calcularPrecio('HORA', SOLO_JORNADA, 2)).toBe(0);
  });
});

describe('resumenTarifas', () => {
  it('junta las modalidades ofrecidas con su duracion', () => {
    expect(resumenTarifas(TODAS)).toBe('$900/h · $5.000 estadía (12 h) · $8.000 jornada (24 h)');
  });

  it('omite las que no se ofrecen', () => {
    expect(resumenTarifas(SOLO_JORNADA)).toBe('$8.000 jornada (24 h)');
  });
});
