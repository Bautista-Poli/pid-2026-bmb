import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Coordenadas } from '@app/utils/distancia.util';
import { DireccionGeoref, TipoLugar, normalizar } from './georef.service';

/**
 * Photon (komoot): buscador de lugares sobre OpenStreetMap hecho para
 * autocompletar mientras se escribe. Gratis, sin clave y con CORS abierto;
 * pide un uso razonable (por eso el buscador espera 3 letras y una pausa).
 *
 * Completa lo que Georef no tiene: plazas, lugares conocidos (el Obelisco, un
 * hospital, una facultad), estaciones, y ademas calles y ciudades por nombre.
 */
const PHOTON = 'https://photon.komoot.io/api/';

/** Argentina entera (oeste, sur, este, norte): no sugiere lugares de otros paises. */
const BBOX_ARGENTINA = '-73.6,-55.1,-53.6,-21.8';

/** Obelisco: hacia donde se priorizan los resultados si no hay otra referencia. */
const CENTRO_POR_DEFECTO: Coordenadas = { latitud: -34.6037, longitud: -58.3816 };

/** Comercios y oficinas llenan la lista y no son un lugar "a donde voy". */
const CLAVES_EXCLUIDAS = new Set(['shop', 'office', 'craft', 'power', 'man_made', 'barrier', 'emergency']);

/** Paradas, andenes y mobiliario urbano: ruido para un buscador de destinos. */
const VALORES_EXCLUIDOS = new Set([
  'bus_stop',
  'platform',
  'stop',
  'stop_position',
  'street_lamp',
  'traffic_signals',
  'crossing',
  'restaurant',
  'cafe',
  'fast_food',
  'bar',
  'pub',
  'ice_cream',
  'doctors',
  'dentist',
  'pharmacy',
  'atm',
  'bank',
  'vending_machine',
  'parking_entrance',
  'bench',
  'waste_basket',
  'subway_entrance',
  'tram_stop',
]);

/** Estaciones de tren y subte: se nombran "Estacion X" para no confundirlas con la calle X. */
const ESTACIONES = new Set(['station', 'halt']);

const LUGARES_POBLADOS = new Set(['city', 'town', 'village', 'hamlet', 'municipality']);
const PARQUES = new Set(['park', 'garden', 'playground', 'dog_park', 'nature_reserve']);

/** Como puede venir CABA en `state` (Photon lo devuelve en ingles o en castellano). */
const NOMBRES_CABA = new Set(['Ciudad Autónoma de Buenos Aires', 'Autonomous City of Buenos Aires']);

interface PropiedadesPhoton {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  locality?: string;
  city?: string;
  county?: string;
  state?: string;
  countrycode?: string;
  osm_key: string;
  osm_value: string;
  type?: string;
}

interface RespuestaPhoton {
  features: { geometry: { coordinates: [number, number] }; properties: PropiedadesPhoton }[];
}

@Injectable({ providedIn: 'root' })
export class LugaresService {
  private readonly http = inject(HttpClient);

  /**
   * Lugares que coinciden con `texto`, priorizando los que estan cerca de
   * `cerca` (la ubicacion del conductor o su busqueda anterior).
   */
  buscar(texto: string, cerca: Coordenadas | null): Observable<DireccionGeoref[]> {
    const centro = cerca ?? CENTRO_POR_DEFECTO;
    const params = new HttpParams({
      fromObject: {
        q: texto,
        limit: 15,
        bbox: BBOX_ARGENTINA,
        lat: centro.latitud,
        lon: centro.longitud,
      },
    });

    return this.http.get<RespuestaPhoton>(PHOTON, { params }).pipe(
      map(({ features }) => {
        const vistos = new Set<string>();
        const lugares: DireccionGeoref[] = [];

        for (const { geometry, properties: p } of features) {
          if (CLAVES_EXCLUIDAS.has(p.osm_key) || VALORES_EXCLUIDOS.has(p.osm_value)) continue;
          // El recuadro de Argentina roza Uruguay y Chile.
          if (p.countrycode && p.countrycode !== 'AR') continue;

          const nombre = nombreDe(p);
          if (!nombre) continue;
          const detalle = detalleDe(p, nombre);

          // Una calle larga viene en varios tramos, y un lugar a veces repetido.
          const clave = `${normalizar(nombre)}|${normalizar(detalle)}`;
          if (vistos.has(clave)) continue;
          vistos.add(clave);

          const [longitud, latitud] = geometry.coordinates;
          lugares.push({ nombre, detalle, coordenadas: { latitud, longitud }, tipo: tipoDe(p) });
        }
        return lugares.slice(0, 8);
      }),
    );
  }
}

/** Un lugar con nombre usa su nombre; una direccion suelta, "Calle 123". */
function nombreDe(p: PropiedadesPhoton): string | null {
  if (p.name && p.osm_key === 'railway' && ESTACIONES.has(p.osm_value)) {
    return /^estaci[oó]n\b/i.test(p.name) ? p.name : `Estación ${p.name}`;
  }
  if (p.name) return p.name;
  if (p.street) return p.housenumber ? `${p.street} ${p.housenumber}` : p.street;
  return null;
}

/**
 * "Recoleta, CABA", "Rosario, Santa Fe": barrio, ciudad y provincia sin repetir.
 * En CABA alcanza con el barrio: la ciudad, la comuna y los "distritos" que
 * trae OSM solo alargan el texto.
 */
function detalleDe(p: PropiedadesPhoton, nombre: string): string {
  const enCaba = p.state != null && NOMBRES_CABA.has(p.state);
  const partes = (
    enCaba
      ? [p.district ?? p.locality, 'CABA']
      : [p.district ?? p.locality, p.city ?? p.county, p.state]
  ).filter((parte): parte is string => Boolean(parte));
  // Si es un lugar con nombre y tiene calle, la calle va primero ("Potosi 4060, Almagro").
  if (p.name && p.street) partes.unshift(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);

  const vistas = new Set<string>([normalizar(nombre)]);
  return partes
    .filter((parte) => {
      const clave = normalizar(parte);
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .join(', ');
}

function tipoDe(p: PropiedadesPhoton): TipoLugar {
  if (p.osm_key === 'place') {
    if (LUGARES_POBLADOS.has(p.osm_value)) return 'ciudad';
    if (p.osm_value === 'house' || p.type === 'house') return 'direccion';
    return 'zona';
  }
  if (p.osm_key === 'highway') return 'calle';
  if (p.osm_key === 'leisure' && PARQUES.has(p.osm_value)) return 'plaza';
  if (p.osm_key === 'boundary') return 'zona';
  return 'lugar';
}
