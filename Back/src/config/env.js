// Variables de entorno centralizadas.
// En desarrollo se cargan con `node --env-file=.env` (ver script "dev").
// En Railway las inyecta la plataforma.

function requerido(nombre, valor) {
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copiala desde .env.example y volve a levantar el servidor.`,
    );
  }
  return valor;
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api',

  db: {
    // Railway expone DATABASE_URL automaticamente al vincular el servicio Postgres.
    url: requerido('DATABASE_URL', process.env.DATABASE_URL),
    // Railway (y la mayoria de los proveedores administrados) usan certificados
    // que no estan en el store local, por eso rejectUnauthorized: false.
    ssl: (process.env.DATABASE_SSL ?? (nodeEnv === 'production' ? 'true' : 'false')) === 'true',
    poolMax: Number(process.env.DATABASE_POOL_MAX) || 10,
  },

  jwt: {
    secret: requerido('JWT_SECRET', process.env.JWT_SECRET),
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,

  // Direccion -> coordenadas con Nominatim (OpenStreetMap). En las pruebas
  // arranca apagado para no depender de la red ni gastar el cupo del servicio.
  // `habilitada` se lee en cada uso (getter) para que las pruebas puedan apagarla
  // despues de importar la app.
  geocodificacion: {
    get habilitada() {
      return (process.env.GEOCODING_ENABLED ?? (nodeEnv === 'test' ? 'false' : 'true')) === 'true';
    },
    url: process.env.GEOCODING_URL || 'https://nominatim.openstreetmap.org',
    userAgent: process.env.GEOCODING_USER_AGENT || 'Parkit/1.0 (proyecto PID 2026)',
  },
};
