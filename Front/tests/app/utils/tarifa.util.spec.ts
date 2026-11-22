import { Tarifas } from '@app/models';
import { calcularPrecio, duracionReservable, resumenTarifas } from '@app/utils/tarifa.util';

const TODAS: Tarifas = { hora: 900, estadia: 5000, jornada: 8000 };
const SOLO_JORNADA: Tarifas = { hora: null, estadia: null, jornada: 8000 };

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

describe('duracionReservable', () => {
  it('mantiene las horas pedidas si se ofrecen, cobradas por hora', () => {
    expect(duracionReservable(3, TODAS)).toEqual({ horas: 3, modalidad: 'HORA' });
  });

  it('12 h y 24 h se cobran como estadia y jornada si hay esas tarifas', () => {
    expect(duracionReservable(12, TODAS)).toEqual({ horas: 12, modalidad: 'ESTADIA' });
    expect(duracionReservable(24, TODAS)).toEqual({ horas: 24, modalidad: 'JORNADA' });
  });

  it('si las horas pedidas no se ofrecen pasa a la primera cantidad posible', () => {
    expect(duracionReservable(2, SOLO_JORNADA)).toEqual({ horas: 24, modalidad: 'JORNADA' });
  });

  it('devuelve null si no hay ninguna tarifa', () => {
    expect(duracionReservable(2, { hora: null, estadia: null, jornada: null })).toBeNull();
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
