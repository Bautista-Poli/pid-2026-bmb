import { Estacionamiento, direccionCorta } from '@app/models';
import { DireccionGeoref, normalizar } from '@app/services/georef.service';

/** Tope de barrios sugeridos (van antes que los estacionamientos). */
const MAX_BARRIOS = 3;

/**
 * Destinos para el buscador del mapa en modo offline, donde no se puede
 * consultar Georef ni Photon: los barrios y los estacionamientos que ya estan en
 * la base y coinciden con lo escrito (nombre, calle o barrio). Un barrio se
 * ubica en el promedio de sus estacionamientos. Solo los que tienen coordenadas.
 */
export function buscarDestinosLocales(texto: string, estacionamientos: Estacionamiento[]): DireccionGeoref[] {
  const buscado = normalizar(texto);
  if (!buscado) return [];
  const coincide = (valor: string | null | undefined) => Boolean(valor) && normalizar(valor!).includes(buscado);

  const ubicados = estacionamientos.filter(
    (e) => e.direccion.latitud != null && e.direccion.longitud != null,
  );

  const barrios = new Map<string, { nombre: string; ciudad: string; latitudes: number[]; longitudes: number[] }>();
  for (const e of ubicados) {
    if (!coincide(e.barrioZona)) continue;
    const clave = `${normalizar(e.barrioZona!)}|${normalizar(e.direccion.ciudad)}`;
    const barrio = barrios.get(clave) ?? { nombre: e.barrioZona!, ciudad: e.direccion.ciudad, latitudes: [], longitudes: [] };
    barrio.latitudes.push(e.direccion.latitud!);
    barrio.longitudes.push(e.direccion.longitud!);
    barrios.set(clave, barrio);
  }
  const promedio = (valores: number[]) => valores.reduce((suma, v) => suma + v, 0) / valores.length;

  const zonas: DireccionGeoref[] = [...barrios.values()].slice(0, MAX_BARRIOS).map((b) => ({
    nombre: b.nombre,
    detalle: b.ciudad,
    coordenadas: { latitud: promedio(b.latitudes), longitud: promedio(b.longitudes) },
    tipo: 'zona',
  }));

  const lugares: DireccionGeoref[] = ubicados
    .filter((e) => coincide(e.nombre) || coincide(e.direccion.calle))
    .map((e) => ({
      nombre: e.nombre,
      detalle: direccionCorta(e.direccion),
      coordenadas: { latitud: e.direccion.latitud!, longitud: e.direccion.longitud! },
      tipo: 'lugar',
    }));

  return [...zonas, ...lugares];
}
