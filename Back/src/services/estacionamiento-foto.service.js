import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import * as cloudinary from './cloudinary.service.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

/**
 * Las fotos del estacionamiento, subidas por su propietario. Son una galeria
 * ordenada: la de menor `orden` es la portada, la que se ve en los listados.
 * Las funciones "de portada" mantienen andando la API de una sola foto
 * (`/:id/foto`) que usa el formulario del propietario.
 *
 * Cada foto viene de uno de dos lados (`imagen`):
 *   - `{ publicId }`: ya esta en Cloudinary (el navegador subio con una firma
 *     de `firmar`). Es el camino normal.
 *   - `{ mime, bytes }`: los bytes van a la base, como antes de Cloudinary. Se
 *     deja un deploy mas para no romper un front viejo cacheado.
 *
 * Los cambios se hacen con el estacionamiento bloqueado (`bloquear`): dos
 * reemplazos a la vez no pueden crear dos portadas ni borrar en Cloudinary la
 * foto que el otro acaba de poner. Lo de Cloudinary se borra despues del commit.
 */

/** Tope de fotos por estacionamiento. */
export const MAX_FOTOS = 10;

const VIOLACION_UNIQUE = '23505';
const COLUMNAS = 'id_imagen, mime, bytes, public_id, actualizada';

const PORTADA = `
  SELECT ${COLUMNAS}
    FROM estacionamiento_imagen
   WHERE id_estacionamiento = $1
   ORDER BY orden, actualizada
   LIMIT 1`;

/** Firma para que el navegador suba una foto a la carpeta del estacionamiento. */
export async function firmar(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);
  return cloudinary.firmarSubida(cloudinary.carpetaDe('estacionamientos', idEstacionamiento));
}

/** `{ mime, bytes, public_id }` listo para guardar, verificando la carpeta si es de Cloudinary. */
async function normalizar(idEstacionamiento, imagen) {
  if (imagen.publicId) {
    await cloudinary.verificar(imagen.publicId, cloudinary.carpetaDe('estacionamientos', idEstacionamiento));
    return { mime: null, bytes: null, public_id: imagen.publicId };
  }
  return { mime: imagen.mime, bytes: imagen.bytes, public_id: null };
}

/** Serializa los cambios de fotos de un estacionamiento (ver arriba). */
function bloquear(client, idEstacionamiento) {
  return client.query('SELECT 1 FROM estacionamiento WHERE id_estacionamiento = $1 FOR UPDATE', [idEstacionamiento]);
}

/** Corre `fn` en una transaccion y traduce una foto repetida a 409. */
async function enTransaccion(fn) {
  try {
    return await withTransaction(fn);
  } catch (error) {
    if (error.code === VIOLACION_UNIQUE) throw ApiError.conflict('Esa foto ya esta cargada');
    throw error;
  }
}

/** La portada (con sus bytes o su public_id), o `null` si no hay fotos. */
export async function obtenerPortada(idEstacionamiento) {
  const { rows } = await query(PORTADA, [idEstacionamiento]);
  return rows[0] ?? null;
}

/** Reemplaza la portada, o la crea si todavia no hay fotos. */
export async function guardarPortada(idEstacionamiento, idPropietario, imagen) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);
  const nueva = await normalizar(idEstacionamiento, imagen);

  const { foto, reemplazada } = await enTransaccion(async (client) => {
    await bloquear(client, idEstacionamiento);
    const { rows: actuales } = await client.query(PORTADA, [idEstacionamiento]);
    const portada = actuales[0];

    if (!portada) {
      const { rows } = await client.query(
        `INSERT INTO estacionamiento_imagen (id_estacionamiento, orden, mime, bytes, public_id)
         VALUES ($1, 0, $2, $3, $4)
         RETURNING id_imagen, actualizada`,
        [idEstacionamiento, nueva.mime, nueva.bytes, nueva.public_id],
      );
      return { foto: rows[0], reemplazada: null };
    }

    const { rows } = await client.query(
      `UPDATE estacionamiento_imagen
          SET mime = $2, bytes = $3, public_id = $4, actualizada = now()
        WHERE id_imagen = $1
        RETURNING id_imagen, actualizada`,
      [portada.id_imagen, nueva.mime, nueva.bytes, nueva.public_id],
    );
    return { foto: rows[0], reemplazada: portada.public_id };
  });

  if (reemplazada !== nueva.public_id) await cloudinary.borrar(reemplazada);
  return foto;
}

/** Saca la portada; la siguiente foto pasa a serlo. Idempotente. */
export async function borrarPortada(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const borrada = await enTransaccion(async (client) => {
    await bloquear(client, idEstacionamiento);
    const { rows } = await client.query(
      `DELETE FROM estacionamiento_imagen
        WHERE id_imagen = (${PORTADA.replace(COLUMNAS, 'id_imagen')})
        RETURNING public_id`,
      [idEstacionamiento],
    );
    return rows[0]?.public_id;
  });
  await cloudinary.borrar(borrada);
}

/** Una foto de la galeria, o `null` si no es de ese estacionamiento. */
export async function obtener(idEstacionamiento, idImagen) {
  const { rows } = await query(
    `SELECT ${COLUMNAS}
       FROM estacionamiento_imagen
      WHERE id_estacionamiento = $1 AND id_imagen = $2`,
    [idEstacionamiento, idImagen],
  );
  return rows[0] ?? null;
}

/** Suma una foto al final de la galeria. */
export async function agregar(idEstacionamiento, idPropietario, imagen) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);
  const nueva = await normalizar(idEstacionamiento, imagen);

  const agregada = await enTransaccion(async (client) => {
    await bloquear(client, idEstacionamiento);
    const { rows } = await client.query(
      `INSERT INTO estacionamiento_imagen (id_estacionamiento, orden, mime, bytes, public_id)
       SELECT $1::uuid, COALESCE(MAX(orden) + 1, 0), $2::varchar, $3::bytea, $4::varchar
         FROM estacionamiento_imagen
        WHERE id_estacionamiento = $1::uuid
       HAVING COUNT(*) < $5::int
       RETURNING id_imagen, orden, actualizada`,
      [idEstacionamiento, nueva.mime, nueva.bytes, nueva.public_id, MAX_FOTOS],
    );
    return rows[0];
  });

  if (!agregada) {
    // La foto ya esta subida a Cloudinary y no entra: no se deja huerfana.
    await cloudinary.borrar(nueva.public_id);
    throw ApiError.conflict(`El estacionamiento ya tiene ${MAX_FOTOS} fotos, borra alguna primero`);
  }
  return agregada;
}

/** Saca una foto de la galeria. Idempotente: borrar una que no esta no es un error. */
export async function borrar(idEstacionamiento, idPropietario, idImagen) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    `DELETE FROM estacionamiento_imagen
      WHERE id_estacionamiento = $1 AND id_imagen = $2
      RETURNING public_id`,
    [idEstacionamiento, idImagen],
  );
  await cloudinary.borrar(rows[0]?.public_id);
}
