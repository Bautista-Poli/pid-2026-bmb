// Fotos en Cloudinary: firma para que el navegador suba directo, verificacion de lo
// subido, URL de cada foto y borrado. Lo usan los services de fotos. Con OFFLINE=true
// cada funcion delega en fotos-locales.service.js (disco), con el mismo contrato.
import { randomUUID } from 'node:crypto';

import { v2 as cloudinary } from 'cloudinary';

import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import * as local from './fotos-locales.service.js';

/**
 * Fotos en Cloudinary. El flujo de una subida:
 *   1. el front pide una firma a la API (`firmarSubida`) para un public_id nuevo;
 *   2. sube el archivo directo a Cloudinary con esa firma (Express no ve los bytes);
 *   3. le manda a la API el `public_id` que devolvio Cloudinary, que se verifica
 *      (`verificar`) y se guarda. La URL se arma al servirla (`url`).
 */

/** Las credenciales se aplican en cada uso: se pueden cargar despues de importar. */
function configurar() {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

const FORMATOS = ['jpg', 'png', 'webp'];

// El ultimo tramo de un public_id que firma la API: un UUID. Cualquier otra
// cosa (subcarpetas, `..`, codificaciones) se rechaza al verificar.
const NOMBRE_VALIDO = /^[A-Za-z0-9_-]+$/;
const MAX_BYTES = 5 * 1024 * 1024;

/** Carpeta de un estacionamiento o vehiculo: `<CLOUDINARY_FOLDER>/<tipo>/<id>`. */
export function carpetaDe(tipo, id) {
  return `${config.cloudinary.carpeta}/${tipo}/${id}`;
}

/**
 * Lo que necesita el navegador para subir UNA foto. La firma cubre el
 * `public_id` (un UUID dentro de la carpeta) y los formatos permitidos, asi que
 * no sirve para subir otra cosa, a otro lado, ni mas de un archivo: reusarla
 * solo pisa esa misma foto. Cloudinary la acepta durante una hora.
 */
export function firmarSubida(carpeta) {
  if (config.offline) return local.firmarSubida(`${carpeta}/${randomUUID()}`, FORMATOS.join(','));
  if (!config.cloudinary.configurada) {
    throw new ApiError(503, 'La subida de fotos no esta disponible en este momento');
  }
  const timestamp = Math.round(Date.now() / 1000);
  const publicId = `${carpeta}/${randomUUID()}`;
  const allowedFormats = FORMATOS.join(',');
  const signature = cloudinary.utils.api_sign_request(
    { allowed_formats: allowedFormats, public_id: publicId, timestamp },
    config.cloudinary.apiSecret,
  );
  return {
    cloudName: config.cloudinary.cloudName,
    apiKey: config.cloudinary.apiKey,
    timestamp,
    signature,
    publicId,
    allowedFormats,
  };
}

/**
 * Antes de asociar un `public_id` se confirma que es de la carpeta propia (si
 * no, cualquiera podria "robar" la foto de otro estacionamiento) y, con
 * Cloudinary habilitada, que existe y es una imagen aceptable.
 */
export async function verificar(publicId, carpeta) {
  const propio =
    typeof publicId === 'string' &&
    publicId.startsWith(`${carpeta}/`) &&
    NOMBRE_VALIDO.test(publicId.slice(carpeta.length + 1));
  if (!propio) throw ApiError.badRequest('La foto no corresponde a este recurso');
  if (config.offline) return local.verificar(publicId);
  if (!config.cloudinary.habilitada) return;

  configurar();
  let recurso;
  try {
    recurso = await cloudinary.api.resource(publicId);
  } catch (error) {
    if (error?.error?.http_code === 404 || error?.http_code === 404) {
      throw ApiError.badRequest('La foto no existe en Cloudinary');
    }
    throw new ApiError(503, 'No pudimos verificar la foto, proba de nuevo en un rato');
  }
  if (!FORMATOS.includes(recurso.format) || recurso.bytes > MAX_BYTES) {
    await borrar(publicId);
    throw ApiError.badRequest('Subi una imagen JPG, PNG o WEBP de hasta 5 MB');
  }
}

/** URL publica, con formato y calidad automaticos y un ancho maximo. */
export function url(publicId, { ancho = 1600 } = {}) {
  if (config.offline) return local.url(publicId);
  configurar();
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
  if (publicId && config.offline) return local.borrar(publicId);
  if (!publicId || !config.cloudinary.habilitada) return;
  configurar();
  try {
    // `invalidate`: que tampoco la sirva la cache del CDN (p. ej. una foto con la patente).
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch (error) {
    console.error(`[cloudinary] no se pudo borrar ${publicId}:`, error.message);
  }
}
