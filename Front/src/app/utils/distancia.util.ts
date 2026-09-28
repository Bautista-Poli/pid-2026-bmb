/** Un punto en el mapa, en grados decimales. */
export interface Coordenadas {
  latitud: number;
  longitud: number;
}

/** Radio medio de la Tierra en km. */
const RADIO_TIERRA_KM = 6371;

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/**
 * Distancia en linea recta entre dos puntos, en km (formula de Haversine).
 * No es la distancia manejando, pero alcanza para ordenar por cercania.
 */
export function distanciaKm(origen: Coordenadas, destino: Coordenadas): number {
  const dLat = aRadianes(destino.latitud - origen.latitud);
  const dLon = aRadianes(destino.longitud - origen.longitud);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(origen.latitud)) * Math.cos(aRadianes(destino.latitud)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(a));
}

/**
 * Distancia desde `origen` hasta un lugar cuyas coordenadas pueden faltar
 * (estacionamientos cargados antes de geocodificar). `undefined` si falta algo.
 */
export function distanciaHasta(
  origen: Coordenadas | null,
  destino: { latitud: number | null; longitud: number | null },
): number | undefined {
  if (!origen || destino.latitud == null || destino.longitud == null) return undefined;
  return distanciaKm(origen, { latitud: destino.latitud, longitud: destino.longitud });
}

/**
 * Comparador para `sort`: el mas cercano primero. Los que no tienen distancia
 * (sin coordenadas o sin ubicacion del usuario) van al final, en el orden que
 * traian (`sort` es estable).
 */
export function porCercania(
  a: { distanciaKm?: number },
  b: { distanciaKm?: number },
): number {
  return (a.distanciaKm ?? Number.POSITIVE_INFINITY) - (b.distanciaKm ?? Number.POSITIVE_INFINITY) || 0;
}

/** Paso de una persona caminando: ~4,8 km/h. */
const METROS_POR_MINUTO_A_PIE = 80;

/** Minutos caminando en linea recta (al menos 1). Es una estimacion, no una ruta. */
export function minutosAPie(km: number): number {
  return Math.max(1, Math.round((km * 1000) / METROS_POR_MINUTO_A_PIE));
}
