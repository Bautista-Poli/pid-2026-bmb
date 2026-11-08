// Conexion a Postgres (pool de pg). `query` para una consulta suelta y
// `withTransaction` para varias que tienen que pasar todas o ninguna.
import pg from 'pg';

import { config } from './env.js';

const { Pool, types } = pg;

// Los DECIMAL/NUMERIC llegan como string para no perder precision; en esta API
// los exponemos como number porque son montos y coordenadas acotadas.
types.setTypeParser(types.builtins.NUMERIC, (valor) => (valor === null ? null : Number(valor)));

export const pool = new Pool({
  connectionString: config.db.url,
  max: config.db.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Evita que una query colgada bloquee una conexion del pool para siempre.
  statement_timeout: 15_000,
});

pool.on('error', (error) => {
  // Un cliente idle que se cae no debe tumbar el proceso.
  console.error('[db] error en cliente idle del pool:', error.message);
});

/** Ejecuta una query usando una conexion del pool. */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Ejecuta `fn` dentro de una transaccion. Commitea si resuelve y hace rollback
 * si lanza. `fn` recibe el client para encadenar queries sobre la misma conexion.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Verifica que la base responda antes de empezar a aceptar requests. */
export async function connectDatabase() {
  const { rows } = await pool.query('SELECT current_database() AS db');
  console.log(`[db] conectado a "${rows[0].db}"`);
}

/** Cierra el pool (al apagar el servidor). */
export async function disconnectDatabase() {
  await pool.end();
}
