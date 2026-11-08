import * as L from 'leaflet';
import { leafletLayer } from 'protomaps-leaflet';

/*
 * El fondo de los mapas de Leaflet (mapa del conductor y selector de ubicacion):
 * el mapa de CABA en un solo archivo (Protomaps, datos de OpenStreetMap) que
 * sirve el back desde Back/datos-locales/mapa. Trae datos hasta zoom 15; mas
 * cerca se agranda lo de ese nivel.
 */
const MAPA_LOCAL = '/api/mapa/caba.pmtiles';
const ZOOM_MAXIMO_DATOS_LOCALES = 15;
const ATRIBUCION_LOCAL = '&copy; OpenStreetMap · Protomaps';

/**
 * La capa de fondo para el tema. Se dibuja en el navegador y no cambia de URL
 * con el tema: para cambiarlo hay que reemplazar la capa entera.
 */
export function crearFondoMapa(oscuro: boolean): L.Layer {
  return leafletLayer({
    url: MAPA_LOCAL,
    flavor: oscuro ? 'dark' : 'light',
    lang: 'es',
    maxDataZoom: ZOOM_MAXIMO_DATOS_LOCALES,
    maxZoom: 19,
    attribution: ATRIBUCION_LOCAL,
  }) as unknown as L.Layer;
}
