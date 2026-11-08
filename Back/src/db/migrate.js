// Aplica el esquema y los datos base. Ejecutar con: npm run db:migrate
// Con `npm run dev` levantado no hace falta: el servidor lo aplica al arrancar y
// se reinicia solo cuando se guarda schema.sql o seed.sql.
import { pool } from '../config/database.js';
import { aplicarEsquema } from './esquema.js';

try {
  await aplicarEsquema();
  console.log('[migrate] listo');
} catch (error) {
  console.error('[migrate] fallo:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
