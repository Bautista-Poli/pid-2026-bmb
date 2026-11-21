// Vencimientos automaticos de reservas (los dispara src/jobs/vencimientos.job.js).
import { query, withTransaction } from '../../config/database.js';
import { ESTADOS_RESERVA, ORIGENES_CANCELACION } from '../../utils/roles.js';
import { buscarCocheraLibre } from '../cochera/cochera-libre.js';
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

// La reserva siguiente se protege cuando ya puede ingresar (30 min antes de su
// inicio, igual que MARGEN_INGRESO_MS en reserva-estados.js).
const ANTICIPACION_REASIGNACION_MS = 30 * 60 * 1000;

export const AVISO_REASIGNADA_POR_EXCESO =
  'Te reasignamos a otra cochera: la tuya sigue ocupada por el vehiculo anterior.';
export const AVISO_AFECTADA_POR_EXCESO =
  'Tu cochera sigue ocupada por el vehiculo anterior y no habia otra libre. ' +
  'El estacionamiento te va a indicar donde estacionar.';

/**
 * Reservas que estan por empezar (o ya empezaron) en una cochera donde sigue un
 * auto excedido (ACTIVA pasada de su fin, sin egreso): se reasignan a otra
 * cochera libre del mismo estacionamiento y tipo; si no hay, quedan donde estan
 * con un aviso para el conductor. Una afectada se vuelve a intentar en cada
 * revision: si se libera otra cochera, se reasigna.
 */
export async function protegerReservasSiguientes() {
  const { rows } = await query(
    `SELECT r.id_reserva
       FROM reserva r
      WHERE r.estado IN ($1, $2)
        AND r.inicio <= now() + make_interval(secs => $3::float / 1000)
        AND r.fin > now()
        AND EXISTS (
          SELECT 1 FROM reserva x
           WHERE x.id_cochera = r.id_cochera
             AND x.id_reserva <> r.id_reserva
             AND x.estado = $4
             AND x.fin <= now()
        )`,
    [ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA, ANTICIPACION_REASIGNACION_MS, ESTADOS_RESERVA.ACTIVA],
  );

  const resultado = { reasignadas: 0, afectadas: 0 };
  for (const { id_reserva } of rows) {
    const accion = await withTransaction(async (client) => {
      const { rows: filas } = await client.query(
        `SELECT r.id_reserva, r.inicio, r.fin, r.id_cochera, r.motivo_reasignacion,
                c.id_estacionamiento, v.id_tipo_vehiculo
           FROM reserva r
           JOIN cochera c  ON c.id_cochera = r.id_cochera
           JOIN vehiculo v ON v.id_vehiculo = r.id_vehiculo
          WHERE r.id_reserva = $1 AND r.estado IN ($2, $3)
          FOR UPDATE OF r`,
        [id_reserva, ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA],
      );
      const reserva = filas[0];
      if (!reserva) return null;

      const { libre } = await buscarCocheraLibre(client, {
        idEstacionamiento: reserva.id_estacionamiento,
        idTipoVehiculo: reserva.id_tipo_vehiculo,
        inicio: reserva.inicio,
        fin: reserva.fin,
        excluir: reserva.id_cochera,
      });
      if (libre) {
        await client.query(
          'UPDATE reserva SET id_cochera = $1, motivo_reasignacion = $2 WHERE id_reserva = $3',
          [libre.id_cochera, AVISO_REASIGNADA_POR_EXCESO, reserva.id_reserva],
        );
        return 'reasignadas';
      }
      // Ya estaba afectada y sigue sin alternativa: no hay nada nuevo.
      if (reserva.motivo_reasignacion === AVISO_AFECTADA_POR_EXCESO) return null;

      await client.query('UPDATE reserva SET motivo_reasignacion = $1 WHERE id_reserva = $2', [
        AVISO_AFECTADA_POR_EXCESO,
        reserva.id_reserva,
      ]);
      return 'afectadas';
    });
    if (accion) resultado[accion] += 1;
  }
  return resultado;
}
