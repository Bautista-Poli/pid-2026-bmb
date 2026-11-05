import * as L from 'leaflet';
import { environment } from '../../environments/environment';

/*
 * El fondo de los mapas de Leaflet (mapa del conductor y selector de ubicacion):
 * mosaicos de CARTO u OpenStreetMap, o en modo offline el mapa local de AMBA.
 */

const CLAVE_CARTO = environment.mapa.claveCarto;
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Mosaicos de CARTO (datos de OpenStreetMap): "Voyager" de dia y "Dark Matter"
 * de noche. Necesitan la clave de `environments/environment.ts`; sin clave el
 * mapa usa los mosaicos de OpenStreetMap, apagados y oscurecidos con un filtro
 * CSS (`.mapa-osm` en styles.css).
 * `{r}` pide la version de alta resolucion en pantallas retina.
 */
const MOSAICOS = CLAVE_CARTO
  ? {
      claro: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CLAVE_CARTO}`,
      oscuro: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CLAVE_CARTO}`,
    }
  : { claro: OSM, oscuro: OSM };

const ATRIBUCION = CLAVE_CARTO
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * Modo offline: el mapa de AMBA en un solo archivo (Protomaps, datos de
 * OpenStreetMap) que sirve el back (`npm run offline:mapa`, ver docs/offline.md).
 * Trae datos hasta zoom 15; mas cerca se agranda lo de ese nivel.
 */
const MAPA_LOCAL = '/api/mapa/amba.pmtiles';
const ZOOM_MAXIMO_DATOS_LOCALES = 15;
const ATRIBUCION_LOCAL = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Protomaps';

/** Si el fondo son los mosaicos de OSM, que llevan el filtro `.mapa-osm`. */
export const usaFiltroOsm = (offline: boolean) => !CLAVE_CARTO && !offline;

/**
 * La capa de fondo para el tema. La local se dibuja en el navegador y no cambia
 * de URL con el tema: para cambiarlo hay que reemplazar la capa entera.
 * protomaps-leaflet se carga solo en modo offline (no pesa en el bundle online).
 */
export async function crearFondoMapa(oscuro: boolean, offline: boolean): Promise<L.Layer> {
  if (!offline) {
    return L.tileLayer(oscuro ? MOSAICOS.oscuro : MOSAICOS.claro, {
      attribution: ATRIBUCION,
      maxZoom: CLAVE_CARTO ? 20 : 19,
    });
  }
  const { leafletLayer } = await import('protomaps-leaflet');
  return leafletLayer({
    url: MAPA_LOCAL,
    flavor: oscuro ? 'dark' : 'light',
    lang: 'es',
    maxDataZoom: ZOOM_MAXIMO_DATOS_LOCALES,
    maxZoom: 19,
    attribution: ATRIBUCION_LOCAL,
  }) as unknown as L.Layer;
}
