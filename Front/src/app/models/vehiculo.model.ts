import { Id } from './api.model';

export type TipoVehiculo = 'AUTO' | 'CAMIONETA' | 'MOTO';

export const ETIQUETA_TIPO_VEHICULO: Record<TipoVehiculo, string> = {
  AUTO: 'Auto',
  CAMIONETA: 'Camioneta',
  MOTO: 'Moto',
};

/** Vehiculo registrado por un usuario con rol CONDUCTOR. */
export interface Vehiculo {
  id: Id;
  /** FK -> Usuario.id (rol CONDUCTOR). */
  usuarioId: Id;
  patente: string;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  tipo: TipoVehiculo;
  /** Se preselecciona al reservar. Como mucho uno por conductor. */
  predeterminado: boolean;
  activo: boolean;
}

/** "Toyota Corolla · Gris · Auto": los datos que completo el conductor. */
export function descripcionVehiculo(vehiculo: Vehiculo): string {
  const nombre = [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ');
  return [nombre, vehiculo.color, ETIQUETA_TIPO_VEHICULO[vehiculo.tipo]].filter(Boolean).join(' · ');
}

/** Payload de `POST /api/vehiculos`. */
export interface NuevoVehiculo {
  patente: string;
  tipo: TipoVehiculo;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
  predeterminado?: boolean;
}

/**
 * Payload de `PATCH /api/vehiculos/:id`: los mismos campos que el alta, todos
 * opcionales porque el editor manda solo lo que cambio. `NuevoVehiculo` es
 * asignable a este tipo, asi que el formulario compartido puede emitir uno solo.
 */
export interface CambiosVehiculo {
  patente?: string;
  tipo?: TipoVehiculo;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
  predeterminado?: boolean;
}
