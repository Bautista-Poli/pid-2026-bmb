// Devoluciones simuladas de una reserva o un abono. Las aplica la aceptacion de
// una propuesta del propietario o la resolucion de la moderacion; nunca se
// devuelve mas de lo que se pago, sumando todas las anteriores.
import { ApiError } from '../utils/ApiError.js';

const redondear = (valor) => Math.round(valor * 100) / 100;

/**
 * Lo pagado, lo ya devuelto y lo que queda por devolver. El llamador que va a
 * devolver tiene que tener bloqueada la reserva/abono (FOR UPDATE) para que
 * dos devoluciones simultaneas no pasen el tope.
 */
export async function topeDe(ejecutor, { idReserva = null, idAbono = null }) {
  const { rows } = await ejecutor.query(
    `SELECT COALESCE(
              (SELECT precio_total FROM reserva WHERE id_reserva = $1),
              (SELECT precio_total FROM abono WHERE id_abono = $2),
              0) AS pagado,
            (SELECT COALESCE(SUM(monto), 0) FROM devolucion
              WHERE id_reserva = $1 OR id_abono = $2) AS devuelto`,
    [idReserva, idAbono],
  );
  const pagado = Number(rows[0].pagado);
  const devuelto = Number(rows[0].devuelto);
  return { pagado, devuelto, tope: redondear(Math.max(0, pagado - devuelto)) };
}

/** 400 si el monto supera el tope. */
export async function asegurarDentroDelTope(ejecutor, objeto, monto, que = 'El monto') {
  const { tope } = await topeDe(ejecutor, objeto);
  if (monto > tope) throw ApiError.badRequest(`${que} supera lo que queda por devolver ($${tope})`);
}

export async function crearDevolucion(client, { idIncidencia, idReserva = null, idAbono = null, monto, aplicadaPor }) {
  await asegurarDentroDelTope(client, { idReserva, idAbono }, monto);
  await client.query(
    `INSERT INTO devolucion (id_incidencia, id_reserva, id_abono, monto, aplicada_por)
     VALUES ($1, $2, $3, $4, $5)`,
    [idIncidencia, idReserva, idAbono, monto, aplicadaPor],
  );
}
