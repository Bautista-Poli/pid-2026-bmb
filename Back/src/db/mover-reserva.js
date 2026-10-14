// Herramienta para probar: mueve una reserva a otro horario, manteniendo su
// duracion, para poder probar el ingreso, el egreso o el no-show sin esperar.
//   npm run db:mover-reserva -- DCU2W3MZ ahora
//   npm run db:mover-reserva -- DCU2W3MZ 12:00 --confirmar
//   npm run db:mover-reserva -- DCU2W3MZ "2026-10-12 08:00"
// --confirmar pasa una PENDIENTE a CONFIRMADA (si no, el job de vencimientos
// la cancela en cuanto su inicio quede en el pasado).
// No valida horario de atencion ni turno del abono: es solo para probar.
import { pool, withTransaction } from '../config/database.js';
import { ESTADOS_RESERVA } from '../utils/roles.js';
import { normalizarCodigo } from '../utils/codigoAcceso.js';
import { formatearArgentina, parsearInicio } from '../utils/moverReserva.js';

const MOVIBLES = [ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA, ESTADOS_RESERVA.ACTIVA];

const argumentos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const confirmar = process.argv.includes('--confirmar');
const codigo = normalizarCodigo(argumentos[0]);
const inicio = parsearInicio(argumentos[1]);

if (!codigo || !inicio) {
  console.error('Uso: npm run db:mover-reserva -- <codigo> <ahora | HH:MM | "AAAA-MM-DD HH:MM"> [--confirmar]');
  process.exit(1);
}

try {
  const reserva = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id_reserva, estado::text AS estado, inicio, fin
         FROM reserva WHERE codigo_acceso = $1 FOR UPDATE`,
      [codigo],
    );
    const actual = rows[0];
    if (!actual) throw new Error(`No hay ninguna reserva con el codigo ${codigo}`);
    if (!MOVIBLES.includes(actual.estado)) {
      throw new Error(`La reserva esta ${actual.estado}; solo se mueven ${MOVIBLES.join(', ')}`);
    }

    const estado =
      confirmar && actual.estado === ESTADOS_RESERVA.PENDIENTE ? ESTADOS_RESERVA.CONFIRMADA : actual.estado;
    const { rows: [movida] } = await client.query(
      `UPDATE reserva
          SET inicio = $1, fin = $1::timestamptz + (fin - inicio), estado = $2
        WHERE id_reserva = $3
        RETURNING estado::text AS estado, inicio, fin`,
      [inicio, estado, actual.id_reserva],
    );
    return { antes: actual, despues: movida };
  });

  const { antes, despues } = reserva;
  console.log(`[mover-reserva] ${codigo}`);
  console.log(`  antes:   ${formatearArgentina(antes.inicio)} a ${formatearArgentina(antes.fin)} (${antes.estado})`);
  console.log(`  despues: ${formatearArgentina(despues.inicio)} a ${formatearArgentina(despues.fin)} (${despues.estado})`);
  if (despues.estado === ESTADOS_RESERVA.PENDIENTE && despues.inicio <= new Date()) {
    console.log('  Ojo: sigue PENDIENTE con el inicio en el pasado; el job de vencimientos la va a cancelar. Usa --confirmar.');
  }
} catch (error) {
  const mensaje =
    error.code === '23P01'
      ? 'En ese horario se superpone con otra reserva de la misma cochera o del mismo vehiculo'
      : error.message;
  console.error(`[mover-reserva] ${mensaje}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
