import { formatearCodigo, normalizarCodigo, urlDeAcceso } from './codigo-acceso.util';

describe('normalizarCodigo', () => {
  it('ignora guion, espacios y minusculas', () => {
    expect(normalizarCodigo(' k7mq-2xtr ')).toBe('K7MQ2XTR');
  });

  it('rechaza caracteres ambiguos y largos incorrectos', () => {
    expect(normalizarCodigo('K7MQ2XT0')).toBeNull();
    expect(normalizarCodigo('K7MQ2XT')).toBeNull();
    expect(normalizarCodigo('')).toBeNull();
  });
});

describe('formatearCodigo', () => {
  it('lo parte en dos para leerlo o dictarlo', () => {
    expect(formatearCodigo('K7MQ2XTR')).toBe('K7MQ-2XTR');
  });
});

describe('urlDeAcceso', () => {
  it('apunta a la pantalla del operador', () => {
    expect(urlDeAcceso('K7MQ2XTR', 'https://parkit.app')).toBe(
      'https://parkit.app/propietario/acceso/K7MQ2XTR',
    );
  });
});
