// Baja logica de una cochera, reactivarla y el borrado fisico (solo sin historial).
import { query, withTransaction } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { ESTADOS_COCHERA, ESTADOS_RESERVA } from '../../utils/roles.js';
import { MENSAJE_VEHICULO_ADENTRO } from '../estacionamiento/estacionamiento-baja.service.js';
import { asegurarPropiedad } from '../estacionamiento/estacionamiento.service.js';
import { CAMPOS } from './cochera.service.js';

// Borrar una fila referenciada por una FK ON DELETE RESTRICT: Postgres 18 (el de
// Neon) responde restrict_violation (23001); versiones anteriores, 23503.
const VIOLACION_RESTRICT = ['23001', '23503'];

/**
 * Baja logica: la cochera puede tener reservas historicas (FK RESTRICT), asi
 * que se desactiva en vez de borrarse. Las reservas vigentes se cancelan, igual
 * que al dar de baja el estacionamiento entero.
 */
export async function darDeBaja(idEstacionamiento, idPropietario, idCochera) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  return withTransaction(async (client) => {
    const { rows: existentes } = await client.query(
      'SELECT activo FROM cochera WHERE id_cochera = $1 AND id_estacionamiento = $2 FOR UPDATE',
      [idCochera, idEstacionamiento],
    );
    if (!existentes[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
    if (!existentes[0].activo) throw ApiError.conflict('La cochera ya esta dada de baja');

    // Con el auto adentro (aunque se haya excedido) no se da de baja, igual que bloquear().
    const { rows: adentro } = await client.query(
      `SELECT 1 FROM reserva WHERE id_cochera = $1 AND estado = $2 LIMIT 1`,
      [idCochera, ESTADOS_RESERVA.ACTIVA],
    );
    if (adentro[0]) throw ApiError.conflict(MENSAJE_VEHICULO_ADENTRO);

    await client.query(
      `UPDATE reserva SET estado = 'CANCELADA', cancelada_por = 'PROPIETARIO'
        WHERE id_cochera = $1 AND estado IN ('PENDIENTE', 'CONFIRMADA') AND fin > now()`,
      [idCochera],
    );

    const { rows } = await client.query(
      `UPDATE cochera SET activo = FALSE, estado_actual = $1
        WHERE id_cochera = $2
        RETURNING ${CAMPOS}`,
      [ESTADOS_COCHERA.INACTIVA, idCochera],
    );
    return rows[0];
  });
}

/** Deshace la baja logica. No se puede reactivar dentro de un estacionamiento dado de baja. */
export async function reactivar(idEstacionamiento, idPropietario, idCochera) {
  const estacionamiento = await asegurarPropiedad(idEstacionamiento, idPropietario);
  if (!estacionamiento.activo) {
    throw ApiError.conflict('El estacionamiento esta dado de baja: no se puede reactivar una cochera');
  }

  const { rows: existentes } = await query(
    'SELECT activo FROM cochera WHERE id_cochera = $1 AND id_estacionamiento = $2',
    [idCochera, idEstacionamiento],
  );
  if (!existentes[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
  if (existentes[0].activo) throw ApiError.conflict('La cochera ya esta activa');

  const { rows } = await query(
    `UPDATE cochera SET activo = TRUE, estado_actual = $1
      WHERE id_cochera = $2
      RETURNING ${CAMPOS}`,
    [ESTADOS_COCHERA.LIBRE, idCochera],
  );
  return rows[0];
}

/**
 * Borrado fisico, para una cochera cargada por error. Primero hay que darla de
 * baja (pasar por INACTIVA) y solo procede si nunca tuvo reservas: con historial
 * la FK lo impide y la cochera queda inactiva.
 */
export async function eliminar(idEstacionamiento, idPropietario, idCochera) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    'SELECT activo FROM cochera WHERE id_cochera = $1 AND id_estacionamiento = $2',
    [idCochera, idEstacionamiento],
  );
  if (!rows[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
  if (rows[0].activo) throw ApiError.conflict('Primero da de baja la cochera para poder eliminarla');

  try {
    await query('DELETE FROM cochera WHERE id_cochera = $1', [idCochera]);
  } catch (error) {
    if (VIOLACION_RESTRICT.includes(error.code)) {
      throw ApiError.conflict('La cochera tiene reservas en su historial: queda inactiva, no se puede eliminar');
    }
    throw error;
  }
}
