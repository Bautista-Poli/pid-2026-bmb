/** Lado mayor con el que se suben las fotos: de sobra para la app y ahorra cupo de Cloudinary. */
export const LADO_MAXIMO = 1600;

/**
 * Achica la foto en el navegador antes de subirla (las de celular pesan 4 o
 * 5 MB y Cloudinary acepta hasta 5). Si ya es chica, o el navegador no puede
 * redimensionar, devuelve el archivo tal cual.
 */
export async function achicarImagen(archivo: Blob, ladoMax = LADO_MAXIMO): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return archivo;

  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, ladoMax / Math.max(imagen.width, imagen.height));
  if (escala === 1 && archivo.size <= 1.5 * 1024 * 1024) {
    imagen.close();
    return archivo;
  }

  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext('2d')?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();

  // WEBP conserva la transparencia de los PNG; si el navegador no lo soporta, devuelve PNG.
  const achicada = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, 'image/webp', 0.85));
  return achicada ?? archivo;
}
