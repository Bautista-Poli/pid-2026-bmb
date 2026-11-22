import { Estacionamiento, ReservaDetallada, reservaSinUsar } from '@app/models';

/** Cocheras de los estacionamientos activos: cuantas hay y cuantas estan libres ahora. */
export function contarCocheras(estacionamientos: Estacionamiento[]): { total: number; libres: number } {
  const activos = estacionamientos.filter((e) => e.activo);
  return {
    total: activos.reduce((suma, e) => suma + e.cocherasTotales, 0),
    libres: activos.reduce((suma, e) => suma + e.cocherasDisponibles, 0),
  };
}

/**
 * Las reservas de ese dia (`YYYY-MM-DD`) que ocuparon (u ocupan) una cochera:
 * sin canceladas ni ausentes, que no se cobran.
 */
export function reservasDelDia(reservas: ReservaDetallada[], fecha: string): ReservaDetallada[] {
  return reservas.filter((r) => r.fecha === fecha && !reservaSinUsar(r));
}
