import { numeroDeCochera } from './numero-cochera.util';

describe('numeroDeCochera', () => {
  it('lee el numero de un identificador numerico', () => {
    expect(numeroDeCochera('7')).toBe(7);
    expect(numeroDeCochera(' 12 ')).toBe(12);
  });

  it('devuelve null para los identificadores viejos', () => {
    expect(numeroDeCochera('A-01')).toBeNull();
    expect(numeroDeCochera('')).toBeNull();
    expect(numeroDeCochera('12345')).toBeNull();
  });
});

