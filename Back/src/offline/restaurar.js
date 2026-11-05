// Carga datos-locales/produccion.dump en la base local, BORRANDO lo que tenga
// (npm run offline:restaurar). No necesita internet. Despues corre db:migrate, que
// es idempotente y suma lo que el esquema tenga de nuevo respecto de la copia.
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config/env.js';
import { correr, fallo, urlLocal } from './comun.js';

try {
  const destino = urlLocal();
  const dump = join(config.datosLocales.carpeta, 'produccion.dump');
  await access(dump).catch(() => {
    throw new Error(`No esta ${dump}: primero npm run offline:copiar (con internet).`);
  });
  console.log(`[offline] restaurando ${dump} en ${new URL(destino).pathname.slice(1)}…`);
  await correr('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', `--dbname=${destino}`, dump]);
  console.log('[offline] base restaurada');
} catch (error) {
  fallo(error);
}
