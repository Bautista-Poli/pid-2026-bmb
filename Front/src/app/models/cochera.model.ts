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
  /** Numero visible para el usuario. Puede ser `A-01` en datos viejos. */
  identificador: string;
  /** Ubicacion en lenguaje natural ("Primer piso"). Se guarda en la columna `sector`. */
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
  /** Ubicacion en lenguaje natural ("Primer piso"). */
  sector?: string;
  tipoVehiculo: TipoVehiculo;
  cubierta?: boolean;
  estado?: EstadoCochera;
}

/**
 * Payload de `POST /api/estacionamientos/:id/cocheras/lote`: da de alta
 * `cantidad` cocheras iguales, numeradas por el backend a partir de la
 * siguiente disponible.
 */
export interface NuevoLoteCocheras {
  estacionamientoId: Id;
  cantidad: number;
  /** Ubicacion en lenguaje natural ("Primer piso"). Obligatoria: distingue un lote de otro. */
  sector: string;
  tipoVehiculo: TipoVehiculo;
  cubierta?: boolean;
}

/** Estados en el orden en que se muestran en los filtros del tablero. */
export const ESTADOS_COCHERA_ORDEN: { valor: EstadoCochera; etiqueta: string }[] = [
  { valor: 'LIBRE', etiqueta: 'Libres' },
  { valor: 'OCUPADA', etiqueta: 'Ocupadas' },
  { valor: 'RESERVADA', etiqueta: 'Reservadas' },
  { valor: 'INACTIVA', etiqueta: 'Inactivas' },
];
