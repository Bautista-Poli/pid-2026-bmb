import { diaCorto } from './fecha.util';

describe('diaCorto', () => {
  it('dia de la semana con mayuscula, numero y mes, sin comas', () => {
    expect(diaCorto('2026-10-03')).toBe('Sáb 3 oct');
  });
});
