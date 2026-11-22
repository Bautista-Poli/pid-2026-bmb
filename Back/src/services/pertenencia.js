// "Cargar o fallar": traen una cosa y verifican que sea de quien la pide.
// Si no existe responden 404 y si es de otro responden 403 (el vehiculo, 404 en
// los dos casos para no revelar vehiculos ajenos). Devuelven la fila cargada.
//
// Uso en una accion nueva:
//   const reserva = await reservaDelConductor(client, idReserva, idConductor);
import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * La reserva con su estacionamiento y propietario, bloqueada (FOR UPDATE) hasta
 * el fin de la transaccion: va con el `client` de withTransaction.
 */
async function bloquearReserva(client, idReserva) {
  const { rows } = await client.query(
    `SELECT r.*, c.id_estacionamiento, e.id_propietario, e.politica_cancelacion_horas
       FROM reserva r
       JOIN cochera c         ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE r.id_reserva = $1
      FOR UPDATE OF r`,
    [idReserva],
  );
  if (!rows[0]) throw ApiError.notFound('La reserva no existe');
  return rows[0];
}

/** Una reserva del conductor que la hizo. 404 si no existe, 403 si es de otro. */
export async function reservaDelConductor(client, idReserva, idConductor) {
  const reserva = await bloquearReserva(client, idReserva);
  if (reserva.id_conductor !== idConductor) {
    throw ApiError.forbidden('La reserva pertenece a otro conductor');
  }
  return reserva;
}

/** Una reserva en un estacionamiento del propietario. 404 si no existe, 403 si es de otro. */
export async function reservaDelPropietario(client, idReserva, idPropietario) {
  const reserva = await bloquearReserva(client, idReserva);
  if (reserva.id_propietario !== idPropietario) {
    throw ApiError.forbidden('La reserva es de otro estacionamiento');
  }
  return reserva;
}

/** Un estacionamiento del propietario. 404 si no existe, 403 si es de otro. */
export async function estacionamientoDelPropietario(idEstacionamiento, idPropietario) {
  const { rows } = await query(
    `SELECT id_estacionamiento, id_propietario, activo
       FROM estacionamiento WHERE id_estacionamiento = $1`,
    [idEstacionamiento],
  );
  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');
  if (rows[0].id_propietario !== idPropietario) {
    throw ApiError.forbidden('El estacionamiento pertenece a otro propietario');
  }
  return rows[0];
}

/** Un vehiculo del conductor. 404 si no existe o es de otro. */
export async function vehiculoDelConductor(idVehiculo, idConductor) {
  const { rows } = await query(
    `SELECT id_vehiculo, id_conductor, id_tipo_vehiculo, patente, marca, modelo, color,
            predeterminado, activo
       FROM vehiculo WHERE id_vehiculo = $1 AND id_conductor = $2`,
    [idVehiculo, idConductor],
  );
  if (!rows[0]) throw ApiError.notFound('Vehiculo no encontrado para este conductor');
  return rows[0];
}
