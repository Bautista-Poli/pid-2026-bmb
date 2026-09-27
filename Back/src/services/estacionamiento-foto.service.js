import { query } from '../config/database.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

/**
 * La foto del estacionamiento: una sola por estacionamiento, subida por su
 * propietario. Los bytes viven en la base (tabla `estacionamiento_foto`) y no
 * en disco porque el filesystem del PaaS es efimero.
 */

/** Guarda la foto, reemplazando la anterior si ya habia una. */
export async function guardar(idEstacionamiento, idPropietario, mime, bytes) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    `INSERT INTO estacionamiento_foto (id_estacionamiento, mime, bytes)
     VALUES ($1, $2, $3)
     ON CONFLICT (id_estacionamiento) DO UPDATE
       SET mime = EXCLUDED.mime, bytes = EXCLUDED.bytes, actualizada = now()
     RETURNING actualizada`,
    [idEstacionamiento, mime, bytes],
  );
  return rows[0];
}

/** La foto con sus bytes, o `null` si el estacionamiento no tiene ninguna. */
export async function obtener(idEstacionamiento) {
  const { rows } = await query(
    `SELECT mime, bytes, actualizada
       FROM estacionamiento_foto
      WHERE id_estacionamiento = $1`,
    [idEstacionamiento],
  );
  return rows[0] ?? null;
}

/** Saca la foto. Es idempotente: borrar cuando no hay no es un error. */
export async function borrar(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  await query('DELETE FROM estacionamiento_foto WHERE id_estacionamiento = $1', [
    idEstacionamiento,
  ]);
}
