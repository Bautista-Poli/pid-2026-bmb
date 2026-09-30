import { Direccion } from '@app/models';
import { linksComoLlegar } from './mapas.util';

const BASE: Direccion = {
  calle: 'Av Corrientes',
  numero: '5400',
  ciudad: 'CABA',
  provincia: 'Buenos Aires',
  codigoPostal: '1414',
  latitud: null,
  longitud: null,
};

describe('linksComoLlegar', () => {
  it('usa las coordenadas cuando las hay', () => {
    const links = linksComoLlegar({ ...BASE, latitud: -34.5985, longitud: -58.4389 });
    expect(links.map((l) => l.url)).toEqual([
      'https://www.google.com/maps/dir/?api=1&destination=-34.5985%2C-58.4389',
      'https://waze.com/ul?ll=-34.5985%2C-58.4389&navigate=yes',
      'https://maps.apple.com/?daddr=-34.5985%2C-58.4389',
    ]);
  });

  it('sin coordenadas cae a la direccion escrita, con provincia para no errarle de ciudad', () => {
    const [google, waze] = linksComoLlegar(BASE);
    expect(google.url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Av%20Corrientes%205400%2C%20CABA%2C%20Buenos%20Aires',
    );
    expect(waze.url).toBe(
      'https://waze.com/ul?q=Av%20Corrientes%205400%2C%20CABA%2C%20Buenos%20Aires&navigate=yes',
    );
  });

  it('nombra cada app', () => {
    expect(linksComoLlegar(BASE).map((l) => l.app)).toEqual(['Google Maps', 'Waze', 'Apple Maps']);
  });
});
