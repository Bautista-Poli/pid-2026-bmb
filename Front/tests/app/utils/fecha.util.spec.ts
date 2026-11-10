import { diaCorto, finDeFranja, hoyISO } from '@app/utils/fecha.util';

describe('finDeFranja', () => {
  it('dentro del mismo dia termina ese dia', () => {
    expect(finDeFranja('2026-10-12', '10:00', '13:00')).toBe('2026-10-12T13:00:00-03:00');
  });

  it('una franja que cruza la medianoche termina al dia siguiente', () => {
    expect(finDeFranja('2026-10-12', '23:00', '01:00')).toBe('2026-10-13T01:00:00-03:00');
  });

  it("'24:00' es la medianoche del dia siguiente, tambien a fin de mes", () => {
    expect(finDeFranja('2026-10-31', '18:00', '24:00')).toBe('2026-11-01T00:00:00-03:00');
  });
});

describe('hoyISO', () => {
  it('usa la fecha argentina aunque en UTC ya sea el dia siguiente', () => {
    // 01:30 UTC del 13 = 22:30 del 12 en Argentina.
    expect(hoyISO(new Date('2026-10-13T01:30:00Z'))).toBe('2026-10-12');
  });
});

describe('diaCorto', () => {
  it('dia de la semana con mayuscula, numero y mes, sin comas', () => {
    expect(diaCorto('2026-10-03')).toBe('Sáb 3 oct');
  });
});
