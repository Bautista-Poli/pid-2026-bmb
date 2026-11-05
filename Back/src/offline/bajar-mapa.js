// Baja el mapa de CABA a datos-locales/mapa/caba.pmtiles (npm run offline:mapa; necesita
// internet y la CLI `pmtiles`). Es un recorte del mapa mundial de Protomaps (datos de
// OpenStreetMap) que el front dibuja sin pedir nada afuera.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config/env.js';
import { correr, fallo } from './comun.js';

// La Ciudad de Buenos Aires con un margen chico: oeste, sur, este, norte.
const BBOX = '-58.54,-34.71,-58.33,-34.52';
// Hasta zoom 15 se leen los nombres de las calles; 16 o mas triplica el tamano.
const ZOOM_MAXIMO = 15;

/** El ultimo build diario de Protomaps (se borran a la semana: no se puede fijar uno). */
async function ultimoBuild() {
  const respuesta = await fetch('https://build-metadata.protomaps.dev/builds.json');
  if (!respuesta.ok) throw new Error(`No se pudo consultar los builds de Protomaps (${respuesta.status})`);
  const builds = await respuesta.json();
  return `https://build.protomaps.com/${builds.at(-1).key}`;
}

try {
  await mkdir(config.datosLocales.mapa, { recursive: true });
  const destino = join(config.datosLocales.mapa, 'caba.pmtiles');
  const origen = await ultimoBuild();
  console.log(`[offline] recortando ${origen} -> ${destino}`);
  await correr('pmtiles', ['extract', origen, destino, `--bbox=${BBOX}`, `--maxzoom=${ZOOM_MAXIMO}`]);
  console.log('[offline] mapa listo');
} catch (error) {
  fallo(error);
}
