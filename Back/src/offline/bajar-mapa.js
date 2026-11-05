// Baja el mapa de AMBA a datos-locales/mapa/amba.pmtiles (npm run offline:mapa; necesita
// internet y la CLI `pmtiles`). Es un recorte del mapa mundial de Protomaps (datos de
// OpenStreetMap), ~50 MB, que el front dibuja sin pedir nada afuera.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config/env.js';
import { correr, fallo } from './comun.js';

// CABA y conurbano, con margen: oeste, sur, este, norte.
const BBOX = '-59.0,-35.0,-57.85,-34.3';
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
  const destino = join(config.datosLocales.mapa, 'amba.pmtiles');
  const origen = await ultimoBuild();
  console.log(`[offline] recortando ${origen} -> ${destino}`);
  await correr('pmtiles', ['extract', origen, destino, `--bbox=${BBOX}`, `--maxzoom=${ZOOM_MAXIMO}`]);
  console.log('[offline] mapa listo');
} catch (error) {
  fallo(error);
}
