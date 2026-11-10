import { Estacionamiento } from '@app/models';
import { buscarDestinosLocales } from '@app/utils/destinos-locales.util';

/** Lo minimo de un estacionamiento que mira la busqueda. */
function estacionamiento(
  nombre: string,
  calle: string,
  barrioZona: string | null,
  latitud: number | null,
  longitud: number | null,
): Estacionamiento {
  return {
    nombre,
    barrioZona,
    direccion: { calle, numero: '100', ciudad: 'CABA', provincia: 'CABA', codigoPostal: '', latitud, longitud },
  } as Estacionamiento;
}

const LISTA = [
  estacionamiento('Garage Palermo Soho', 'Honduras', 'Palermo', -34.58, -58.43),
  estacionamiento('Cochera Plaza Serrano', 'Gurruchaga', 'Palermo', -34.6, -58.41),
  estacionamiento('Centro Parking', 'Corrientes', 'San Nicolás', -34.6, -58.38),
  estacionamiento('Sin ubicar', 'Corrientes', 'Palermo', null, null),
];

describe('buscarDestinosLocales', () => {
  it('sugiere el barrio (en el promedio de sus estacionamientos) y despues los que coinciden', () => {
    const [barrio, ...resto] = buscarDestinosLocales('palermo', LISTA);
    expect(barrio).toEqual({
      nombre: 'Palermo',
      detalle: 'CABA',
      coordenadas: { latitud: -34.59, longitud: -58.42 },
      tipo: 'zona',
    });
    expect(resto.map((d) => d.nombre)).toEqual(['Garage Palermo Soho']);
  });

  it('busca por calle sin importar acentos ni mayusculas, y deja afuera los que no tienen coordenadas', () => {
    expect(buscarDestinosLocales('CÓRRIENTES', LISTA).map((d) => d.nombre)).toEqual(['Centro Parking']);
  });

  it('sin texto no sugiere nada', () => {
    expect(buscarDestinosLocales('  ', LISTA)).toEqual([]);
  });
});
