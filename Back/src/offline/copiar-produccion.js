// Baja una copia de la base de produccion a datos-locales/produccion.dump (necesita
// internet; npm run offline:copiar). Despues offline:restaurar la carga en la base local.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config/env.js';
import { correr, fallo } from './comun.js';

/** Donde queda la copia: sirve para volver a restaurar sin internet. */
const ARCHIVO_DUMP = join(config.datosLocales.carpeta, 'produccion.dump');

try {
  const origen = process.env.PRODUCCION_DATABASE_URL;
  if (!origen) {
    throw new Error('Falta PRODUCCION_DATABASE_URL en Back/.env: la cadena de conexion de Neon, branch production.');
  }
  await mkdir(config.datosLocales.carpeta, { recursive: true });
  console.log(`[offline] copiando produccion (${new URL(origen).hostname}) a ${ARCHIVO_DUMP}…`);
  // Formato custom (-Fc): comprimido y restaurable con pg_restore. Sin duenos ni
  // permisos: en la base local el dueno es el usuario de esta maquina.
  await correr('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${ARCHIVO_DUMP}`, origen]);
  console.log('[offline] copia lista');
} catch (error) {
  fallo(error);
}
