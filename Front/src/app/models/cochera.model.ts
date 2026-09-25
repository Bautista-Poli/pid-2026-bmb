import { Id } from './api.model';
import { TipoVehiculo } from './vehiculo.model';

export type EstadoCochera = 'LIBRE' | 'OCUPADA' | 'RESERVADA' | 'INACTIVA';

export const ETIQUETA_ESTADO_COCHERA: Record<EstadoCochera, string> = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  RESERVADA: 'Reservada',
  INACTIVA: 'Inactiva',
};

/** Cochera individual dentro de un Estacionamiento. */
export interface Cochera {
  id: Id;
  /** FK -> Estacionamiento.id. */
  estacionamientoId: Id;
  /** Identificador visible para el usuario: `A-01`, `B-14`. */
  identificador: string;
  sector: string;
  tipoVehiculo: TipoVehiculo;
  cubierta: boolean;
  /** Estado fisico, o RESERVADA mientras transcurre una reserva vigente. */
  estado: EstadoCochera;
}

/** Payload de `POST /api/estacionamientos/:id/cocheras`. */
export interface NuevaCochera {
  estacionamientoId: Id;
  identificador: string;
  sector?: string;
  tipoVehiculo: TipoVehiculo;
  cubierta?: boolean;
  estado?: EstadoCochera;
}

/**
 * Un lote de `POST /api/estacionamientos/:id/cocheras/lote`: `cantidad` cocheras
 * con identificadores `<prefijo>-<n>` y el mismo detalle de ubicacion (`sector`).
 */
export interface LoteCocheras {
  cantidad: number;
  /** Detalle de ubicacion: `Planta baja`, `Primer piso`. */
  sector: string;
  prefijo: string;
  tipoVehiculo: TipoVehiculo;
  cubierta: boolean;
}

/** Estados en el orden en que se muestran en los filtros del tablero. */
export const ESTADOS_COCHERA_ORDEN: { valor: EstadoCochera; etiqueta: string }[] = [
  { valor: 'LIBRE', etiqueta: 'Libres' },
  { valor: 'OCUPADA', etiqueta: 'Ocupadas' },
  { valor: 'RESERVADA', etiqueta: 'Reservadas' },
  { valor: 'INACTIVA', etiqueta: 'Inactivas' },
];
