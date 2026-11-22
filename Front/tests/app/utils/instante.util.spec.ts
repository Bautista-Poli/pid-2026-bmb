import { desdeAhora, instante, instanteDeTexto } from '@app/utils/instante.util';

/** El texto ISO de una fecha armada en hora local, como hace el util. */
const iso = (anio: number, mes: number, dia = 1, hora = 0, minuto = 0) =>
  new Date(anio, mes - 1, dia, hora, minuto).toISOString();

// 15 de noviembre de 2026, 10:30.
const hoy = new Date(2026, 10, 15, 10, 30);

describe('instante', () => {
  it('con solo el mes, es el dia 1 de ese mes de este año a las 00:00', () => {
    expect(instante({ mes: 10 }, hoy)).toBe(iso(2026, 10, 1));
  });

  it('con mes, dia y hora', () => {
    expect(instante({ mes: 10, dia: 15, hora: 8 }, hoy)).toBe(iso(2026, 10, 15, 8));
  });

  it('con solo la hora, es hoy a esa hora en punto', () => {
    expect(instante({ hora: 8 }, hoy)).toBe(iso(2026, 11, 15, 8));
  });

  it('con solo el dia, es ese dia de este mes a las 00:00', () => {
    expect(instante({ dia: 3 }, hoy)).toBe(iso(2026, 11, 3));
  });

  it('con solo el año, es el 1 de enero', () => {
    expect(instante({ anio: 2025 }, hoy)).toBe(iso(2025, 1, 1));
  });

  it('con mes y hora, el dia que falta en el medio es el 1', () => {
    expect(instante({ mes: 10, hora: 8 }, hoy)).toBe(iso(2026, 10, 1, 8));
  });

  it('el mes 0 es diciembre del año anterior y el 13 enero del siguiente', () => {
    expect(instante({ mes: 0 }, hoy)).toBe(iso(2025, 12, 1));
    expect(instante({ mes: 13 }, hoy)).toBe(iso(2027, 1, 1));
  });
});

describe('instante con sumar', () => {
  it('sin nada, es ahora mismo', () => {
    expect(instante({}, hoy)).toBe(hoy.toISOString());
  });

  it('30 minutos mas y 30 minutos menos que ahora', () => {
    expect(instante({ sumar: { minutos: 30 } }, hoy)).toBe(iso(2026, 11, 15, 11, 0));
    expect(instante({ sumar: { minutos: -30 } }, hoy)).toBe(iso(2026, 11, 15, 10, 0));
  });

  it('sumar horas cruza de dia', () => {
    expect(instante({ sumar: { horas: 20 } }, hoy)).toBe(iso(2026, 11, 16, 6, 30));
  });

  it('el 1 del mes pasado, tambien en enero', () => {
    expect(instante({ dia: 1, sumar: { meses: -1 } }, hoy)).toBe(iso(2026, 10, 1));
    expect(instante({ dia: 1, sumar: { meses: -1 } }, new Date(2026, 0, 20))).toBe(iso(2025, 12, 1));
  });

  it('hace 7 dias a las 00:00', () => {
    expect(instante({ dia: 15, sumar: { dias: -7 } }, hoy)).toBe(iso(2026, 11, 8));
  });

  it('una hora fija mas unos minutos', () => {
    expect(instante({ hora: 8, sumar: { minutos: 45 } }, hoy)).toBe(iso(2026, 11, 15, 8, 45));
  });
});

describe('desdeAhora', () => {
  it('corre la hora de ahora sin ponerla en cero', () => {
    expect(desdeAhora({ minutos: 30 }, hoy)).toBe(iso(2026, 11, 15, 11, 0));
    expect(desdeAhora({ minutos: -30 }, hoy)).toBe(iso(2026, 11, 15, 10, 0));
    expect(desdeAhora({ dias: -7 }, hoy)).toBe(iso(2026, 11, 8, 10, 30));
  });
});

describe('instanteDeTexto', () => {
  it('el texto de un input de fecha es ese dia a las 00:00 locales', () => {
    expect(instanteDeTexto('2026-11-15')).toBe(iso(2026, 11, 15));
  });
});
