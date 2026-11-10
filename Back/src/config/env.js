// Variables de entorno centralizadas.
// En desarrollo se cargan con `node --env-file=.env` (ver script "dev").
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Devuelve la variable o corta el arranque si falta. */
function requerido(nombre, valor) {
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copiala desde .env.example y volve a levantar el servidor.`,
    );
  }
  return valor;
}

const nodeEnv = process.env.NODE_ENV || 'development';

/** Back/datos-locales: mapa y copia de la base (no se suben al repo). */
const DATOS_LOCALES_POR_DEFECTO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'datos-locales');

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api',

  // Todo corre en esta maquina, sin internet (ver docs/local.md).
  datosLocales: {
    get carpeta() {
      return resolve(process.env.DATOS_LOCALES_DIR || DATOS_LOCALES_POR_DEFECTO);
    },
    get mapa() {
      return join(this.carpeta, 'mapa');
    },
  },

  db: {
    // Postgres local: postgresql://<usuario>@localhost:5432/parkit_local
    url: requerido('DATABASE_URL', process.env.DATABASE_URL),
    poolMax: Number(process.env.DATABASE_POOL_MAX) || 10,
  },

  jwt: {
    secret: requerido('JWT_SECRET', process.env.JWT_SECRET),
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
};
