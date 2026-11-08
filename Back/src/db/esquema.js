// Aplica schema.sql y seed.sql a la base. Los dos son idempotentes (IF NOT EXISTS,
// ON CONFLICT...), asi que se pueden correr cada vez que arranca el servidor.
// Lo usan `npm run db:migrate` (migrate.js) y `npm run dev` (index.js).
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '../config/database.js';

const carpeta = dirname(fileURLToPath(import.meta.url));

/** Corre un archivo .sql entero contra la base. */
async function ejecutarArchivo(nombre) {
  const sql = await readFile(join(carpeta, nombre), 'utf8');
  await pool.query(sql);
  console.log(`[esquema] ${nombre} aplicado`);
}

/** Aplica el esquema y despues los datos base. Lanza si el SQL tiene un error. */
export async function aplicarEsquema() {
  await ejecutarArchivo('schema.sql');
  await ejecutarArchivo('seed.sql');
}
