import app from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { detenerVencimientosAutomaticos, iniciarVencimientosAutomaticos } from './jobs/vencimientos.job.js';

async function main() {
  await connectDatabase();

  // 0.0.0.0 es necesario para que el contenedor sea alcanzable en Railway.
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[api] Parkit escuchando en :${config.port}${config.apiPrefix}`);
  });

  iniciarVencimientosAutomaticos();

  const shutdown = (senal) => {
    console.log(`\n[api] ${senal} recibido, cerrando...`);
    detenerVencimientosAutomaticos();
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
