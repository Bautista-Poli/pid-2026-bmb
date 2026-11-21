// Aplica a la base los .sql de tablas/ (en orden, por su numero) y despues
// seed.sql. Todos son idempotentes (IF NOT EXISTS, ON CONFLICT...), asi que se
// pueden correr cada vez que arranca el servidor.
// Lo usan `npm run db:migrate` (migrate.js) y `npm run dev` (index.js).
import { readFile, readdir } from 'node:fs/promises';
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

/** Aplica las tablas y despues los datos base. Lanza si el SQL tiene un error. */
export async function aplicarEsquema() {
  const tablas = (await readdir(join(carpeta, 'tablas'))).filter((a) => a.endsWith('.sql')).sort();
  for (const archivo of tablas) await ejecutarArchivo(join('tablas', archivo));
  await ejecutarArchivo('seed.sql');
}
