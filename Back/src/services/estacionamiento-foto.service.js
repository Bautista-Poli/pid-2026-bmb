import { config } from '../config/env.js';
import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { asegurarPropiedad } from './estacionamiento.service.js';
import { borrarImagen, subirImagen } from './cloudinary.service.js';

/**
 * Las fotos del estacionamiento, subidas por su propietario. Los bytes se
 * guardan en Cloudinary (la fila guarda su `cloudinary_id` y su `url`). Si
 * Cloudinary no esta configurado, quedan en la base (tabla
 * `estacionamiento_imagen`, columna `bytes`), como antes.
 *
 * Son una galeria ordenada: la de menor `orden` es la portada, la que se ve en
 * los listados. Las funciones "de portada" mantienen andando la API de una
 * sola foto (`/:id/foto`) que usa el formulario del propietario.
 */

/** Tope de fotos por estacionamiento: cada una puede pesar hasta 2 MB. */
export const MAX_FOTOS = 10;

const PORTADA = `
  SELECT id_imagen, mime, bytes, url, cloudinary_id, actualizada
    FROM estacionamiento_imagen
   WHERE id_estacionamiento = $1
   ORDER BY orden, actualizada
   LIMIT 1`;

/**
 * Donde va el contenido de una foto nueva: a Cloudinary si esta habilitado, o a
 * la base si no. Devuelve las columnas que guarda la fila.
 */
async function almacenar(mime, bytes) {
  if (!config.cloudinary.habilitado) {
    return { bytes, cloudinary_id: null, url: null };
  }
  const { cloudinary_id, url } = await subirImagen(bytes, mime);
  return { bytes: null, cloudinary_id, url };
}

/**
 * Borra de Cloudinary la imagen de una fila ya borrada de la base. Si
 * Cloudinary falla no se revierte nada: la foto queda huerfana y se loguea.
 */
async function liberar(cloudinaryId) {
  if (!cloudinaryId) return;
  await borrarImagen(cloudinaryId).catch((error) => {
    console.error('[cloudinary]', error.message);
  });
}

/** La portada con sus bytes o su URL, o `null` si el estacionamiento no tiene fotos. */
export async function obtenerPortada(idEstacionamiento) {
  const { rows } = await query(PORTADA, [idEstacionamiento]);
  return rows[0] ?? null;
}

/** Reemplaza la portada, o la crea si todavia no hay fotos. */
export async function guardarPortada(idEstacionamiento, idPropietario, mime, bytes) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const contenido = await almacenar(mime, bytes);
  const portada = await obtenerPortada(idEstacionamiento);
  if (!portada) {
    const { rows } = await query(
      `INSERT INTO estacionamiento_imagen (id_estacionamiento, orden, mime, bytes, cloudinary_id, url)
       VALUES ($1, 0, $2, $3, $4, $5)
       RETURNING id_imagen, actualizada`,
      [idEstacionamiento, mime, contenido.bytes, contenido.cloudinary_id, contenido.url],
    );
    return rows[0];
  }

  const { rows } = await query(
    `UPDATE estacionamiento_imagen
        SET mime = $2, bytes = $3, cloudinary_id = $4, url = $5, actualizada = now()
      WHERE id_imagen = $1
      RETURNING id_imagen, actualizada`,
    [portada.id_imagen, mime, contenido.bytes, contenido.cloudinary_id, contenido.url],
  );
  await liberar(portada.cloudinary_id);
  return rows[0];
}

/** Saca la portada; la siguiente foto pasa a serlo. Idempotente. */
export async function borrarPortada(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const portada = await obtenerPortada(idEstacionamiento);
  if (portada) {
    await query('DELETE FROM estacionamiento_imagen WHERE id_imagen = $1', [portada.id_imagen]);
    await liberar(portada.cloudinary_id);
  }
}

/** Una foto de la galeria con sus bytes o su URL, o `null` si no es de ese estacionamiento. */
export async function obtener(idEstacionamiento, idImagen) {
  const { rows } = await query(
    `SELECT mime, bytes, url, actualizada
       FROM estacionamiento_imagen
      WHERE id_estacionamiento = $1 AND id_imagen = $2`,
    [idEstacionamiento, idImagen],
  );
  return rows[0] ?? null;
}

/** Suma una foto al final de la galeria. */
export async function agregar(idEstacionamiento, idPropietario, mime, bytes) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const contenido = await almacenar(mime, bytes);
  const { rows } = await query(
    `INSERT INTO estacionamiento_imagen (id_estacionamiento, orden, mime, bytes, cloudinary_id, url)
     SELECT $1::uuid, COALESCE(MAX(orden) + 1, 0), $2::varchar, $3::bytea, $5::varchar, $6::varchar
       FROM estacionamiento_imagen
      WHERE id_estacionamiento = $1::uuid
     HAVING COUNT(*) < $4::int
     RETURNING id_imagen, orden, actualizada`,
    [idEstacionamiento, mime, contenido.bytes, MAX_FOTOS, contenido.cloudinary_id, contenido.url],
  );
  if (!rows[0]) {
    // Ya se subio a Cloudinary; como no entra en la galeria, se borra.
    await liberar(contenido.cloudinary_id);
    throw ApiError.conflict(`El estacionamiento ya tiene ${MAX_FOTOS} fotos, borra alguna primero`);
  }
  return rows[0];
}

/** Saca una foto de la galeria. Idempotente: borrar una que no esta no es un error. */
export async function borrar(idEstacionamiento, idPropietario, idImagen) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    `DELETE FROM estacionamiento_imagen
      WHERE id_estacionamiento = $1 AND id_imagen = $2
      RETURNING cloudinary_id`,
    [idEstacionamiento, idImagen],
  );
  await liberar(rows[0]?.cloudinary_id);
}
