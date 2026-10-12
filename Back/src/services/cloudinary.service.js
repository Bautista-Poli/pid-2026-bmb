import { v2 as cloudinary } from 'cloudinary';

import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Fotos en Cloudinary. El flujo de una subida:
 *   1. el front pide una firma a la API (`firmarSubida`) para una carpeta;
 *   2. sube el archivo directo a Cloudinary con esa firma (Express no ve los bytes);
 *   3. le manda a la API el `public_id` que devolvio Cloudinary, que se verifica
 *      (`verificar`) y se guarda. La URL se arma al servirla (`url`).
 */

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

const FORMATOS = ['jpg', 'png', 'webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Carpeta de un estacionamiento o vehiculo: `<CLOUDINARY_FOLDER>/<tipo>/<id>`. */
export function carpetaDe(tipo, id) {
  return `${config.cloudinary.carpeta}/${tipo}/${id}`;
}

/** Lo que necesita el navegador para subir a esa carpeta. Vale una hora. */
export function firmarSubida(carpeta) {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ folder: carpeta, timestamp }, config.cloudinary.apiSecret);
  return {
    cloudName: config.cloudinary.cloudName,
    apiKey: config.cloudinary.apiKey,
    timestamp,
    signature,
    folder: carpeta,
  };
}

/**
 * Antes de asociar un `public_id` se confirma que es de la carpeta propia (si
 * no, cualquiera podria "robar" la foto de otro estacionamiento) y, con
 * Cloudinary habilitada, que existe y es una imagen aceptable.
 */
export async function verificar(publicId, carpeta) {
  if (typeof publicId !== 'string' || !publicId.startsWith(`${carpeta}/`)) {
    throw ApiError.badRequest('La foto no corresponde a este recurso');
  }
  if (!config.cloudinary.habilitada) return;

  let recurso;
  try {
    recurso = await cloudinary.api.resource(publicId);
  } catch {
    throw ApiError.badRequest('La foto no existe en Cloudinary');
  }
  if (!FORMATOS.includes(recurso.format) || recurso.bytes > MAX_BYTES) {
    await borrar(publicId);
    throw ApiError.badRequest('Subi una imagen JPG, PNG o WEBP de hasta 5 MB');
  }
}

/** URL publica, con formato y calidad automaticos y un ancho maximo. */
export function url(publicId, { ancho = 1600 } = {}) {
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [{ fetch_format: 'auto', quality: 'auto', crop: 'limit', width: ancho }],
  });
}

/**
 * Borra la foto en Cloudinary. Si falla no se propaga: lo importante es que la
 * base ya no la referencie; una foto huerfana en Cloudinary no rompe nada.
 */
export async function borrar(publicId) {
  if (!publicId || !config.cloudinary.habilitada) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error(`[cloudinary] no se pudo borrar ${publicId}:`, error.message);
  }
}

/** Sube bytes que ya estan en el servidor (lo usa el script de migracion). */
export function subirBytes(bytes, carpeta) {
  return new Promise((resolver, rechazar) => {
    const subida = cloudinary.uploader.upload_stream({ folder: carpeta }, (error, resultado) =>
      error ? rechazar(error) : resolver(resultado.public_id),
    );
    subida.end(bytes);
  });
}
