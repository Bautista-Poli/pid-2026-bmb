import { Vehiculo } from '@app/models';

/**
 * Fotos de catalogo que vienen con el proyecto (`public/vehiculos/`), indexadas
 * por `marca modelo` normalizado.
 *
 * Es decoracion, no un dato del vehiculo: la API no guarda imagenes. Si el
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

/** La foto del modelo, o `null` si no hay una para ese vehiculo. */
export function fotoDeVehiculo(vehiculo: Vehiculo): string | null {
  const clave = normalizar([vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' '));
  return clave ? (FOTOS[clave] ?? null) : null;
}
