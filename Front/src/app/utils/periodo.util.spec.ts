import { errorDeRango, periodoDeUrl, rangoDePeriodo, variacion } from './periodo.util';

// Mediodia en Buenos Aires, para que el dia local no dependa de la zona del equipo.
const hoy = new Date('2026-10-12T12:00:00-03:00');

describe('rangoDePeriodo', () => {
  it('ultimos 7 dias, incluyendo hoy', () => {
    expect(rangoDePeriodo('7D', hoy)).toEqual({ desde: '2026-10-06', hasta: '2026-10-12' });
  });

  it('este mes va del 1 a hoy', () => {
    expect(rangoDePeriodo('MES', hoy)).toEqual({ desde: '2026-10-01', hasta: '2026-10-12' });
  });
});

describe('errorDeRango', () => {
  it('un rango valido no tiene error', () => {
    expect(errorDeRango('2026-09-01', '2026-09-30')).toBeNull();
    expect(errorDeRango('2026-09-01', '2026-09-01')).toBeNull();
  });

  it('faltan fechas, estan al reves o el rango es muy largo', () => {
    expect(errorDeRango('', '2026-09-30')).toBe('Elegí las dos fechas');
    expect(errorDeRango('2026-09-30', '2026-09-01')).toBe('La fecha "desde" tiene que ser anterior a "hasta"');
    expect(errorDeRango('2026-01-01', '2026-06-30')).toBe('El rango puede ser de hasta 92 días');
    expect(errorDeRango('2026-13-01', '2026-13-05')).toBe('Elegí las dos fechas');
  });
});

describe('periodoDeUrl', () => {
  it('sin nada en la URL es este mes', () => {
    expect(periodoDeUrl({}, hoy)).toEqual({ tipo: 'MES', desde: '2026-10-01', hasta: '2026-10-12' });
  });

  it('un periodo predefinido', () => {
    expect(periodoDeUrl({ periodo: '7D' }, hoy)).toEqual({ tipo: '7D', desde: '2026-10-06', hasta: '2026-10-12' });
  });

  it('un rango personalizado valido gana sobre el periodo', () => {
    expect(periodoDeUrl({ periodo: '7D', desde: '2026-09-01', hasta: '2026-09-15' }, hoy)).toEqual({
      tipo: 'RANGO',
      desde: '2026-09-01',
      hasta: '2026-09-15',
    });
  });

  it('un rango invalido o un periodo viejo vuelven a este mes', () => {
    expect(periodoDeUrl({ desde: '2026-09-30', hasta: '2026-09-01' }, hoy).tipo).toBe('MES');
    expect(periodoDeUrl({ periodo: '30D' }, hoy).tipo).toBe('MES');
  });
});

describe('variacion', () => {
  it('sube o baja en porcentaje contra el periodo anterior', () => {
    expect(variacion(125, 100)).toEqual({ sube: true, texto: '+25 % vs. período anterior' });
    expect(variacion(90, 100)).toEqual({ sube: false, texto: '−10 % vs. período anterior' });
  });

  it('sin cambio, o sin periodo anterior con que comparar', () => {
    expect(variacion(100, 100)).toEqual({ sube: null, texto: 'Igual que el período anterior' });
    expect(variacion(5, 0)).toEqual({ sube: null, texto: '—' });
  });

  it('en las tasas, menos es mejor si se pide', () => {
    expect(variacion(0.1, 0.2, { menosEsMejor: true })).toEqual({ sube: true, texto: '−50 % vs. período anterior' });
  });

  it('las tasas se comparan en puntos porcentuales, aun desde 0', () => {
    expect(variacion(0.5, 0.4, { puntos: true })).toEqual({ sube: true, texto: '+10 pp vs. período anterior' });
    expect(variacion(0.14, 0, { puntos: true, menosEsMejor: true })).toEqual({
      sube: false,
      texto: '+14 pp vs. período anterior',
    });
  });
});
