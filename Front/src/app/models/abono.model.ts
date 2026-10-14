import { FechaISO, HoraHHmm, Id } from './api.model';

/** Turnos de los abonos. Espejo de Back/src/utils/turnos.js. */
export type TurnoAbono = 'MANANA' | 'TARDE' | 'NOCHE';

export const TURNOS: Record<TurnoAbono, { etiqueta: string; desde: HoraHHmm; hasta: HoraHHmm }> = {
  MANANA: { etiqueta: 'Mañana', desde: '06:00', hasta: '12:00' },
  TARDE: { etiqueta: 'Tarde', desde: '12:00', hasta: '18:00' },
  NOCHE: { etiqueta: 'Noche', desde: '18:00', hasta: '24:00' },
};

export const ORDEN_TURNOS: TurnoAbono[] = ['MANANA', 'TARDE', 'NOCHE'];

export type EstadoAbono = 'VIGENTE' | 'CANCELADO' | 'VENCIDO';

/** Lo que ofrece el propietario: usos y precio de un turno. */
export interface PlanAbono {
  id: Id;
  estacionamientoId: Id;
  turno: TurnoAbono;
  cupos: number;
  precio: number;
}

export interface NuevoPlanAbono {
  turno: TurnoAbono;
  cupos: number;
  precio: number;
}

/** Lo que compro el conductor: un cupo de usos prepago en un turno. */
export interface Abono {
  id: Id;
  estacionamientoId: Id;
  estacionamiento: string;
  conductor: string;
  turno: TurnoAbono;
  cuposTotales: number;
  cuposUsados: number;
  cuposRestantes: number;
  precioTotal: number;
  desde: FechaISO;
  hasta: FechaISO;
  estado: EstadoAbono;
  /** Lo devuelto por reclamos (simulado). */
  devuelto: number;
  /** El reclamo abierto o denunciado sobre este abono, si hay. */
  reclamoAbierto: Id | null;
}

/** Reserva gratis dentro del turno del abono. */
export interface NuevaReservaConAbono {
  abonoId: Id;
  vehiculoId: Id;
  fecha: FechaISO;
  horaDesde: HoraHHmm;
  horaHasta: HoraHHmm;
}
