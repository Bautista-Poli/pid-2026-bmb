import { Vehiculo } from '@app/models';

/**
 * Fotos de catalogo que vienen con el proyecto (`public/vehiculos/`), indexadas
 * por `marca modelo` normalizado. Son el respaldo cuando el conductor no subio
 * una foto propia de su vehiculo (`vehiculo.foto`, en Cloudinary). Si el
 * modelo no esta en la lista no se inventa una foto, la ficha cae en el icono
 * de respaldo. Para sumar una: dejar el archivo en `public/vehiculos/` (400x280)
 * y agregar su entrada aca.
 */
const FOTOS: Record<string, string> = {
  'toyota corolla': 'vehiculos/toyota-corolla.jpg',
  'volkswagen taos': 'vehiculos/volkswagen-taos.jpg',
  'vw taos': 'vehiculos/volkswagen-taos.jpg',
  'fiat argo': 'vehiculos/fiat-argo.jpg',
  'honda cb 190': 'vehiculos/honda-cb190.jpg',
  'honda cb190': 'vehiculos/honda-cb190.jpg',
  'honda cb 190r': 'vehiculos/honda-cb190.jpg',
  'honda cb190r': 'vehiculos/honda-cb190.jpg',
};

/** Minusculas, sin acentos y con los espacios colapsados. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** La foto propia del vehiculo, si no la del modelo, o `null` si no hay ninguna. */
export function fotoDeVehiculo(vehiculo: Vehiculo): string | null {
  if (vehiculo.foto) return vehiculo.foto;
  const clave = normalizar([vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' '));
  return clave ? (FOTOS[clave] ?? null) : null;
}

/** Para recuadros chicos: la miniatura de la foto propia, o la de catalogo. */
export function miniaturaDeVehiculo(vehiculo: Vehiculo): string | null {
  return vehiculo.fotoMiniatura ?? fotoDeVehiculo(vehiculo);
}
