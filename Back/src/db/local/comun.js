// Ayudas de los scripts de la base local (npm run db:crear / db:restaurar): correr programas
// externos y asegurarse de que la base que se va a pisar es la local.
import { spawn } from 'node:child_process';

/** Hosts que cuentan como "esta maquina". */
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '']);

/**
 * Corta si DATABASE_URL no apunta a esta maquina: los scripts que restauran la
 * copia BORRAN la base de destino, y nunca tiene que ser la de produccion.
 */
export function urlLocal(nombre = 'DATABASE_URL') {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en Back/.env.local (ver docs/local.md).`);
  const { hostname } = new URL(valor);
  if (!HOSTS_LOCALES.has(hostname)) {
    throw new Error(`${nombre} apunta a "${hostname}", no a esta maquina. Tiene que ser localhost.`);
  }
  return valor;
}

/** Corre un programa mostrando su salida; rechaza si termina con error. */
export function correr(programa, args) {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(programa, args, { stdio: 'inherit' });
    hijo.on('error', (error) => {
      rechazar(error.code === 'ENOENT' ? new Error(`No se encontro "${programa}" (ver docs/local.md).`) : error);
    });
    hijo.on('close', (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`${programa} termino con codigo ${codigo}`))));
  });
}

/** Para el final de cada script: mensaje de error legible y codigo de salida 1. */
export function fallo(error) {
  console.error(`\n[local] ${error.message}`);
  process.exitCode = 1;
}
