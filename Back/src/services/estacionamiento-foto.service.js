import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

/**
 * Las fotos del estacionamiento, subidas por su propietario. Los bytes viven
 * en la base (tabla `estacionamiento_imagen`) y no en disco porque el
 * filesystem del PaaS es efimero.
 *
 * Son una galeria ordenada: la de menor `orden` es la portada, la que se ve en
 * los listados. Las funciones "de portada" mantienen andando la API de una
 * sola foto (`/:id/foto`) que usa el formulario del propietario.
 */

/** Tope de fotos por estacionamiento: cada una puede pesar hasta 2 MB en la base. */
export const MAX_FOTOS = 10;

const PORTADA = `
  SELECT id_imagen, mime, bytes, actualizada
    FROM estacionamiento_imagen
   WHERE id_estacionamiento = $1
   ORDER BY orden, actualizada
   LIMIT 1`;

/** La portada con sus bytes, o `null` si el estacionamiento no tiene fotos. */
export async function obtenerPortada(idEstacionamiento) {
  const { rows } = await query(PORTADA, [idEstacionamiento]);
  return rows[0] ?? null;
}

/** Reemplaza la portada, o la crea si todavia no hay fotos. */
export async function guardarPortada(idEstacionamiento, idPropietario, mime, bytes) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const portada = await obtenerPortada(idEstacionamiento);
  if (!portada) {
    const { rows } = await query(
      `INSERT INTO estacionamiento_imagen (id_estacionamiento, orden, mime, bytes)
       VALUES ($1, 0, $2, $3)
       RETURNING id_imagen, actualizada`,
      [idEstacionamiento, mime, bytes],
    );
    return rows[0];
  }

  const { rows } = await query(
    `UPDATE estacionamiento_imagen
        SET mime = $2, bytes = $3, actualizada = now()
      WHERE id_imagen = $1
      RETURNING id_imagen, actualizada`,
    [portada.id_imagen, mime, bytes],
  );
  return rows[0];
}

/** Saca la portada; la siguiente foto pasa a serlo. Idempotente. */
export async function borrarPortada(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const portada = await obtenerPortada(idEstacionamiento);
  if (portada) {
    await query('DELETE FROM estacionamiento_imagen WHERE id_imagen = $1', [portada.id_imagen]);
  }
}

/** Una foto de la galeria con sus bytes, o `null` si no es de ese estacionamiento. */
export async function obtener(idEstacionamiento, idImagen) {
  const { rows } = await query(
    `SELECT mime, bytes, actualizada
       FROM estacionamiento_imagen
      WHERE id_estacionamiento = $1 AND id_imagen = $2`,
    [idEstacionamiento, idImagen],
  );
  return rows[0] ?? null;
}

/** Suma una foto al final de la galeria. */
export async function agregar(idEstacionamiento, idPropietario, mime, bytes) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    `INSERT INTO estacionamiento_imagen (id_estacionamiento, orden, mime, bytes)
     SELECT $1::uuid, COALESCE(MAX(orden) + 1, 0), $2::varchar, $3::bytea
       FROM estacionamiento_imagen
      WHERE id_estacionamiento = $1::uuid
     HAVING COUNT(*) < $4::int
     RETURNING id_imagen, orden, actualizada`,
    [idEstacionamiento, mime, bytes, MAX_FOTOS],
  );
  if (!rows[0]) {
    throw ApiError.conflict(`El estacionamiento ya tiene ${MAX_FOTOS} fotos, borra alguna primero`);
  }
  return rows[0];
}

/** Saca una foto de la galeria. Idempotente: borrar una que no esta no es un error. */
export async function borrar(idEstacionamiento, idPropietario, idImagen) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  await query('DELETE FROM estacionamiento_imagen WHERE id_estacionamiento = $1 AND id_imagen = $2', [
    idEstacionamiento,
    idImagen,
  ]);
}
