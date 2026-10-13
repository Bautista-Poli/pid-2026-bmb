import { createHash } from 'node:crypto';

import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Cliente minimo de la API de Cloudinary, sin SDK: subida y borrado firmados
 * con la API secret. Las imagenes viven en Cloudinary; la base solo guarda el
 * `public_id` (para borrarlas) y la URL (para servirlas).
 */

/**
 * Firma de Cloudinary: los parametros ordenados por nombre, pegados como
 * `clave=valor` con `&`, mas la API secret, todo en sha1.
 */
export function firmar(params, apiSecret) {
  const cadena = Object.keys(params)
    .sort()
    .map((clave) => `${clave}=${params[clave]}`)
    .join('&');
  return createHash('sha1').update(cadena + apiSecret).digest('hex');
}

function urlDeApi(recurso) {
  return `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/${recurso}`;
}

/** Sube la imagen a la carpeta del proyecto. Devuelve su `public_id` y su URL segura. */
export async function subirImagen(bytes, mime) {
  const { apiKey, apiSecret, carpeta } = config.cloudinary;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = firmar({ folder: carpeta, timestamp }, apiSecret);

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }));
  form.append('folder', carpeta);
  form.append('timestamp', String(timestamp));
  form.append('api_key', apiKey);
  form.append('signature', signature);

  const respuesta = await fetch(urlDeApi('image/upload'), { method: 'POST', body: form });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    console.error('[cloudinary] subida rechazada:', datos.error?.message ?? respuesta.status);
    throw new ApiError(502, 'No se pudo guardar la foto, intentalo de nuevo');
  }
  return { cloudinary_id: datos.public_id, url: datos.secure_url };
}

/** Borra la imagen de Cloudinary. Lanza si Cloudinary no la pudo borrar. */
export async function borrarImagen(publicId) {
  const { apiKey, apiSecret } = config.cloudinary;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = firmar({ public_id: publicId, timestamp }, apiSecret);

  const respuesta = await fetch(urlDeApi('image/destroy'), {
    method: 'POST',
    body: new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature }),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || datos.result === 'error') {
    throw new Error(`Cloudinary no pudo borrar ${publicId}: ${datos.error?.message ?? respuesta.status}`);
  }
}
