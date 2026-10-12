import { rangoDePeriodo, variacion } from './periodo.util';

// Mediodia en Buenos Aires, para que el dia local no dependa de la zona del equipo.
const hoy = new Date('2026-10-12T12:00:00-03:00');

describe('rangoDePeriodo', () => {
  it('ultimos 7 y 30 dias, incluyendo hoy', () => {
    expect(rangoDePeriodo('7D', hoy)).toEqual({ desde: '2026-10-06', hasta: '2026-10-12' });
    expect(rangoDePeriodo('30D', hoy)).toEqual({ desde: '2026-09-13', hasta: '2026-10-12' });
  });

  it('este mes va del 1 a hoy', () => {
    expect(rangoDePeriodo('MES', hoy)).toEqual({ desde: '2026-10-01', hasta: '2026-10-12' });
  });

  it('el mes anterior completo, aun cruzando de año', () => {
    expect(rangoDePeriodo('MES_ANTERIOR', hoy)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    const enero = new Date('2027-01-15T12:00:00-03:00');
    expect(rangoDePeriodo('MES_ANTERIOR', enero)).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
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
