// Crea la base local de DATABASE_URL si no existe (npm run db:crear, que despues
// aplica el esquema con db:migrate). Postgres tiene que estar corriendo en esta maquina.
import pg from 'pg';

import { fallo, urlLocal } from './comun.js';

try {
  const url = new URL(urlLocal());
  const nombre = decodeURIComponent(url.pathname.slice(1));
  if (!nombre) throw new Error('DATABASE_URL no tiene el nombre de la base (…:5432/parkit_local).');

  // Para crear una base hay que conectarse a otra: la de mantenimiento `postgres`.
  url.pathname = '/postgres';
  const cliente = new pg.Client({ connectionString: url.toString() });
  await cliente.connect().catch((error) => {
    throw new Error(`No se pudo conectar a Postgres local (${error.message}). ¿Esta corriendo? Ver docs/local.md.`);
  });
  try {
    const { rows } = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
    if (rows[0]) {
      console.log(`[local] la base "${nombre}" ya existe`);
    } else {
      // El nombre no se puede pasar como parametro: se escapa como identificador.
      await cliente.query(`CREATE DATABASE ${cliente.escapeIdentifier(nombre)}`);
      console.log(`[local] base "${nombre}" creada`);
    }
  } finally {
    await cliente.end();
  }
} catch (error) {
  fallo(error);
}
