/** Radio medio de la Tierra, en km. */
const RADIO_TIERRA_KM = 6371;

/** Distancia entre dos puntos (formula de Haversine), en linea recta. */
export function distanciaKm(
  origen: { latitud: number; longitud: number },
  destino: { latitud: number; longitud: number },
): number {
  const dLat = aRadianes(destino.latitud - origen.latitud);
  const dLon = aRadianes(destino.longitud - origen.longitud);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(origen.latitud)) * Math.cos(aRadianes(destino.latitud)) * Math.sin(dLon / 2) ** 2;
  return RADIO_TIERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function aRadianes(grados: number): number {
  return (grados * Math.PI) / 180;
}
