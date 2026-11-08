// `npm run check`: lo unico que hay que correr para saber si se rompio algo.
// Compila el Front, corre sus tests y despues los del Back (contra Postgres local).
// Si un paso pasa muestra una linea; si falla, solo los errores, y corta ahi.
import { spawnSync } from 'node:child_process';

/** Saca los codigos de color de la terminal, para buscar en el texto. */
const sinColores = (texto) => texto.replace(/\x1b\[[0-9;]*m/g, '');

const PASOS = [
  {
    nombre: 'Postgres local corriendo',
    cmd: 'pg_isready',
    args: ['-q'],
    siFalla: () => 'Levantalo con: brew services start postgresql@18',
  },
  {
    nombre: 'Compilar el Front',
    cmd: 'npm',
    args: ['--prefix', 'Front', 'run', 'build', '--silent'],
    // Solo los errores de compilacion (los WARNING no cortan nada).
    siFalla: (salida) =>
      sinColores(salida)
        .split(/\n(?=▲ \[WARNING\]|✘ \[ERROR\])/)
        .filter((bloque) => bloque.startsWith('✘ [ERROR]'))
        .join('\n') || salida,
  },
  {
    nombre: 'Tests del Front',
    cmd: 'npm',
    args: ['--prefix', 'Front', 'test', '--silent', '--', '--watch=false'],
    resumen: (salida) => sinColores(salida).match(/Tests\s+(\d+) passed/)?.[1],
    // Desde el primer archivo que fallo hasta el final (detalle y resumen de vitest).
    siFalla: (salida) => {
      const desde = salida.search(/FAIL|Failed Tests/);
      return desde >= 0 ? salida.slice(desde) : salida;
    },
  },
  {
    nombre: 'Tests del Back',
    cmd: 'npm',
    args: ['--prefix', 'Back', 'test', '--silent'],
    resumen: (salida) => sinColores(salida).match(/ℹ pass (\d+)/)?.[1],
    // node:test termina con la lista de los que fallaron y por que.
    siFalla: (salida) => {
      const desde = salida.indexOf('failing tests:');
      return desde >= 0 ? `✖ ${salida.slice(desde)}` : salida;
    },
  },
];

for (const paso of PASOS) {
  process.stdout.write(`▶ ${paso.nombre}… `);
  const { status, error, stdout = '', stderr = '' } = spawnSync(paso.cmd, paso.args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  const salida = `${stdout}${stderr}`;

  if (error || status !== 0) {
    console.log('✖');
    console.error(`\n${paso.siFalla(error ? error.message : salida).trim()}\n`);
    console.error(`✖ Fallo: ${paso.nombre}.\n`);
    process.exit(1);
  }
  const cantidad = paso.resumen?.(salida);
  console.log(cantidad ? `✔ (${cantidad} pasaron)` : '✔');
}
console.log('\n✔ Todo OK: el Front compila y pasan los tests del Front y del Back.\n');
