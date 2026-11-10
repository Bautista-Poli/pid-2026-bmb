// Vencimientos automaticos de reservas (los dispara src/jobs/vencimientos.job.js).
import { query, withTransaction } from '../../config/database.js';
import { ESTADOS_RESERVA, ORIGENES_CANCELACION } from '../../utils/roles.js';
import { TOLERANCIA_NO_SHOW_MS, cambiarEstado } from './reserva-estados.js';

/*
 * Vencimientos automaticos: los llama src/jobs/vencimientos.job.js al llegar pedidos.
 * Cada reserva vencida se procesa en su propia transaccion con FOR UPDATE,
 * igual que las acciones manuales, asi una revision nunca pisa una
 * confirmacion/ingreso/egreso que este pasando al mismo tiempo.
 */

/**
 * Procesa cada reserva vencida en su propia transaccion: `procesar(client, id)`
 * la vuelve a buscar con FOR UPDATE (pudo cambiar desde la consulta) y devuelve
 * true si la movio. Devuelve cuantas se movieron.
 */
async function procesarVencidas(ids, procesar) {
  let movidas = 0;
  for (const id of ids) {
    if (await withTransaction((client) => procesar(client, id))) movidas += 1;
  }
  return movidas;
}

/** PENDIENTE que nunca se confirmo y ya empezo su franja: se cancela. */
export async function vencerPendientesSinConfirmar() {
  const { rows } = await query(
    `SELECT id_reserva FROM reserva WHERE estado = $1 AND inicio <= now()`,
    [ESTADOS_RESERVA.PENDIENTE],
  );

  return procesarVencidas(rows.map((r) => r.id_reserva), async (client, id) => {
    const { rows: filas } = await client.query(
      `SELECT id_reserva, estado FROM reserva WHERE id_reserva = $1 AND estado = $2 FOR UPDATE`,
      [id, ESTADOS_RESERVA.PENDIENTE],
    );
    if (!filas[0]) return false;
    await cambiarEstado(client, filas[0], ESTADOS_RESERVA.CANCELADA, {
      canceladaPor: ORIGENES_CANCELACION.SISTEMA,
    });
    return true;
  });
}

/**
 * CONFIRMADA sin ingreso, pasada la tolerancia desde `inicio` (o ya terminada,
 * si la franja es mas corta que la tolerancia): pasa a NO_SHOW. Como NO_SHOW
 * no es un estado vigente, la cochera queda disponible en el acto para la
 * disponibilidad, la busqueda y las reservas nuevas.
 */
export async function vencerAusentes() {
  const { rows } = await query(
    `SELECT id_reserva FROM reserva
      WHERE estado = $1 AND ingreso_real IS NULL
        AND LEAST(inicio + make_interval(secs => $2::float / 1000), fin) < now()`,
    [ESTADOS_RESERVA.CONFIRMADA, TOLERANCIA_NO_SHOW_MS],
  );

  return procesarVencidas(rows.map((r) => r.id_reserva), async (client, id) => {
    const { rows: filas } = await client.query(
      `SELECT id_reserva, estado FROM reserva
        WHERE id_reserva = $1 AND estado = $2 AND ingreso_real IS NULL
        FOR UPDATE`,
      [id, ESTADOS_RESERVA.CONFIRMADA],
    );
    if (!filas[0]) return false;
    await cambiarEstado(client, filas[0], ESTADOS_RESERVA.NO_SHOW);
    return true;
  });
}
