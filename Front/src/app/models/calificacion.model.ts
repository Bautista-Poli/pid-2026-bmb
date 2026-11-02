import { FechaHoraISO } from './api.model';

/** Quien califica: el conductor al estacionamiento o el propietario al conductor. */
export type AutorCalificacion = 'CONDUCTOR' | 'PROPIETARIO';

/** Promedio (un decimal) y cantidad de calificaciones recibidas. Sin calificaciones: `promedio` null. */
export interface Reputacion {
  promedio: number | null;
  cantidad: number;
}

/** Una calificacion vista por quien la recibio: sin autor ni reserva. */
export interface CalificacionRecibida {
  puntaje: number;
  comentario: string | null;
  creadaEn: FechaHoraISO;
}

export interface CalificacionesRecibidas {
  resumen: Reputacion;
  calificaciones: CalificacionRecibida[];
}

/** Payload de `POST /api/reservas/:id/calificacion`. */
export interface NuevaCalificacion {
  puntaje: number;
  comentario?: string;
}
