import { Cochera } from '@app/models';
import { numeroDeCochera, siguienteNumero } from './numero-cochera.util';

function cochera(identificador: string): Cochera {
  return {
    id: identificador,
    estacionamientoId: 'e1',
    identificador,
    sector: '',
    tipoVehiculo: 'AUTO',
    cubierta: true,
    estado: 'LIBRE',
  };
}

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

describe('siguienteNumero', () => {
  it('arranca en 1 cuando no hay cocheras', () => {
    expect(siguienteNumero([])).toBe(1);
  });

  it('sigue al mayor cargado', () => {
    expect(siguienteNumero(['1', '2', '3'].map(cochera))).toBe(4);
  });

  // El UNIQUE del backend cuenta las bajas, asi que un hueco no se reutiliza.
  it('no reutiliza el numero de una cochera dada de baja', () => {
    const cocheras = ['1', '5'].map(cochera);
    cocheras[1].estado = 'INACTIVA';
    expect(siguienteNumero(cocheras)).toBe(6);
  });

  it('ignora los identificadores viejos', () => {
    expect(siguienteNumero(['A-01', 'B-14'].map(cochera))).toBe(1);
    expect(siguienteNumero(['A-01', '3'].map(cochera))).toBe(4);
  });
});
