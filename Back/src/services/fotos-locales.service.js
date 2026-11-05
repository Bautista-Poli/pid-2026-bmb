// Fotos en disco para el modo offline (OFFLINE=true): reemplaza a Cloudinary con
// el mismo contrato (firma -> subida -> public_id), asi el resto de la API no cambia.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Cada foto vive en `datos-locales/fotos/<public_id>.<ext>`. El `public_id` es
 * el mismo que tendria en Cloudinary (`<carpeta>/<tipo>/<id>/<uuid>`), asi que
 * las fotos copiadas de Cloudinary (npm run offline:fotos) se encuentran igual.
 *
 * La subida la hace el navegador contra la API (POST /api/fotos-locales) con
 * una firma HMAC que cubre el public_id y la hora: igual que con Cloudinary, no
 * sirve para subir otra cosa ni a otro lado, y vence en una hora.
 */

/** Extension por formato. La subida detecta el formato por los primeros bytes. */
export const EXTENSIONES = ['jpg', 'png', 'webp'];
export const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const MAX_BYTES = 5 * 1024 * 1024;
const VIGENCIA_FIRMA_S = 60 * 60;

// Tramos de carpeta y nombre: letras, numeros, guion y guion bajo. Asi un
// public_id nunca sale de la carpeta de fotos (`..`, barras de mas, etc.).
const TRAMO = /^[A-Za-z0-9_-]+$/;

/** Si el public_id es seguro para usarlo como ruta dentro de la carpeta de fotos. */
export function publicIdValido(publicId) {
  return typeof publicId === 'string' && publicId.length <= 300 && publicId.split('/').every((t) => TRAMO.test(t));
}

function firmar(publicId, timestamp) {
  return createHmac('sha256', config.jwt.secret).update(`${publicId}:${timestamp}`).digest('hex');
}

/** Lo que necesita el navegador para subir UNA foto (mismos campos que Cloudinary, mas `urlSubida`). */
export function firmarSubida(publicId, allowedFormats) {
  const timestamp = Math.round(Date.now() / 1000);
  return {
    cloudName: 'local',
    apiKey: 'local',
    timestamp,
    signature: firmar(publicId, timestamp),
    publicId,
    allowedFormats,
    // Relativa: el front le antepone /api (apiInterceptor).
    urlSubida: '/fotos-locales',
  };
}

/** Lanza 403 si la firma no es de este public_id o ya vencio. */
export function asegurarFirma(publicId, timestamp, signature) {
  const ts = Number(timestamp);
  const vigente = Number.isInteger(ts) && Math.abs(Date.now() / 1000 - ts) <= VIGENCIA_FIRMA_S;
  const esperada = Buffer.from(firmar(publicId, ts));
  const recibida = Buffer.from(String(signature ?? ''));
  const coincide = esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
  if (!vigente || !coincide) throw ApiError.forbidden('La firma de la subida no es valida o ya vencio');
}

/** jpg, png o webp segun los primeros bytes; null si no es ninguna. */
export function formatoDe(bytes) {
  if (!Buffer.isBuffer(bytes)) return null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

const rutaDe = (publicId, ext) => join(config.datosLocales.fotos, `${publicId}.${ext}`);

/** Guarda la foto (pisando la anterior con ese public_id, sea del formato que sea). */
export async function guardar(publicId, bytes) {
  if (!publicIdValido(publicId)) throw ApiError.badRequest('public_id invalido');
  const formato = formatoDe(bytes);
  if (!formato || bytes.length > MAX_BYTES) throw ApiError.badRequest('Subi una imagen JPG, PNG o WEBP de hasta 5 MB');
  await borrar(publicId);
  const ruta = rutaDe(publicId, formato);
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, bytes);
}

/** La ruta en disco de la foto y su mime, o null si no esta. */
export async function buscar(publicId) {
  if (!publicIdValido(publicId)) return null;
  for (const ext of EXTENSIONES) {
    const ruta = rutaDe(publicId, ext);
    try {
      if ((await stat(ruta)).isFile()) return { ruta, mime: MIME[ext] };
    } catch {
      // No esta con esta extension: probar la siguiente.
    }
  }
  return null;
}

/** Antes de asociar un public_id a un recurso: tiene que estar subida. */
export async function verificar(publicId) {
  if (!(await buscar(publicId))) throw ApiError.badRequest('La foto no se subio');
}

/** URL relativa a la misma API: el front la usa tal cual en un <img>. */
export function url(publicId) {
  return `${config.apiPrefix}/fotos-locales/${publicId}`;
}

/** Borra la foto. Idempotente: si no esta, no pasa nada. */
export async function borrar(publicId) {
  if (!publicIdValido(publicId)) return;
  await Promise.all(EXTENSIONES.map((ext) => rm(rutaDe(publicId, ext), { force: true })));
}
