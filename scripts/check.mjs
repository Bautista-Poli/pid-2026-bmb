// `npm run check`: lo unico que hay que correr para saber si se rompio algo.
// Compila el Front, corre sus tests y despues los del Back (contra Postgres local).
// Corta en el primer paso que falla y dice cual fue.
import { spawnSync } from 'node:child_process';

const PASOS = [
  { nombre: 'Postgres local corriendo', cmd: 'pg_isready', args: ['-q'],
    ayuda: 'Levantalo con: brew services start postgresql@18' },
  { nombre: 'Compilar el Front', cmd: 'npm', args: ['--prefix', 'Front', 'run', 'build', '--silent'] },
  { nombre: 'Tests del Front', cmd: 'npm', args: ['--prefix', 'Front', 'test', '--silent', '--', '--watch=false'] },
  { nombre: 'Tests del Back', cmd: 'npm', args: ['--prefix', 'Back', 'test', '--silent'] },
];

for (const paso of PASOS) {
  console.log(`\n▶ ${paso.nombre}…`);
  const { status, error } = spawnSync(paso.cmd, paso.args, { stdio: 'inherit' });
  if (error || status !== 0) {
    console.error(`\n✖ Fallo: ${paso.nombre}.${paso.ayuda ? ` ${paso.ayuda}` : ' Mira el error de arriba.'}\n`);
    process.exit(1);
  }
}
console.log('\n✔ Todo OK: el Front compila y pasan los tests del Front y del Back.\n');
