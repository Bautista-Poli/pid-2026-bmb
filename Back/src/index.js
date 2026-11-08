// Punto de entrada del servidor: conecta la base, escucha el puerto, activa los
// vencimientos a demanda y cierra todo prolijo al recibir SIGINT/SIGTERM.
import app from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { aplicarEsquema } from './db/esquema.js';
import { activarVencimientosADemanda, desactivarVencimientosADemanda } from './jobs/vencimientos.job.js';

/** Arranca el servidor; si falla la conexion inicial, el proceso termina. */
async function main() {
  await connectDatabase();

  // En local, cada arranque aplica schema.sql y seed.sql: con `npm run dev`
  // alcanza con guardar esos archivos para que el cambio llegue a la base.
  if (!config.isProduction) await aplicarEsquema();

  // 0.0.0.0 es necesario para que el contenedor sea alcanzable en Railway.
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[api] Parkit escuchando en :${config.port}${config.apiPrefix}`);
  });

  // Vencimientos a demanda: corren con los pedidos, no con un reloj (ver el job).
  activarVencimientosADemanda();

  const shutdown = (senal) => {
    console.log(`\n[api] ${senal} recibido, cerrando...`);
    desactivarVencimientosADemanda();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Si alguna conexion queda colgada, no bloqueamos el deploy indefinidamente.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[api] no se pudo iniciar el servidor:', error.message);
  process.exit(1);
});
