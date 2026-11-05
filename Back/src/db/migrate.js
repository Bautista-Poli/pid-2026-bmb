// Aplica el esquema y los datos base. Ejecutar con: npm run db:migrate
// Es idempotente, asi que se puede correr en cada deploy.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '../config/database.js';

const carpeta = dirname(fileURLToPath(import.meta.url));

/** Corre un archivo .sql entero contra la base. */
async function ejecutarArchivo(nombre) {
  const sql = await readFile(join(carpeta, nombre), 'utf8');
  await pool.query(sql);
  console.log(`[migrate] ${nombre} aplicado`);
}

try {
  await ejecutarArchivo('schema.sql');
  await ejecutarArchivo('seed.sql');
  console.log('[migrate] listo');
} catch (error) {
  console.error('[migrate] fallo:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
