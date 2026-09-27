import { FechaHoraISO, FechaISO, HoraHHmm, Id } from './api.model';
import { Cochera } from './cochera.model';
import { Estacionamiento } from './estacionamiento.model';
import { ModalidadReserva } from './tarifa.model';
import { TipoVehiculo, Vehiculo } from './vehiculo.model';

export type EstadoReserva =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'EN_CURSO'
  | 'FINALIZADA'
  | 'CANCELADA';

export const ETIQUETA_ESTADO_RESERVA: Record<EstadoReserva, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  EN_CURSO: 'En curso',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

/** Reserva transaccional: Conductor + Vehiculo + Cochera + franja horaria. */
export interface Reserva {
  id: Id;
  /** FK -> Usuario.id (rol CONDUCTOR). */
  conductorId: Id;
  /** FK -> Estacionamiento.id. */
  estacionamientoId: Id;
  /** FK -> Cochera.id. La asigna el backend al confirmar. */
  cocheraId: Id | null;
  cocheraIdentificador: string | null;
  /** FK -> Vehiculo.id. */
  vehiculoId: Id;
  fecha: FechaISO;
  horaDesde: HoraHHmm;
  horaHasta: HoraHHmm;
  /** Dia en que termina: distinto de `fecha` cuando la reserva cruza la medianoche. */
  fechaHasta: FechaISO;
  modalidad: ModalidadReserva;
  estado: EstadoReserva;
  precioTotal: number;
  creadaEn: FechaHoraISO;
  /** Horas reales que registra el propietario. */
  ingresoEn: FechaHoraISO | null;
  egresoEn: FechaHoraISO | null;
}

/**
 * Vista expandida que devuelve `GET /api/reservas` para no obligar al front
 * a resolver cada FK por separado.
 */
export interface ReservaDetallada extends Reserva {
  estacionamiento: Pick<Estacionamiento, 'id' | 'nombre' | 'direccion'>;
  vehiculo: Pick<Vehiculo, 'id' | 'patente' | 'marca' | 'modelo' | 'tipo'>;
  cochera: Pick<Cochera, 'id' | 'identificador' | 'sector'> | null;
}

/** Datos que junta el flujo de reserva: vehiculo, modalidad, fecha y hora. */
export interface NuevaReserva {
  estacionamientoId: Id;
  vehiculoId: Id;
  modalidad: ModalidadReserva;
  fecha: FechaISO;
  horaDesde: HoraHHmm;
  /** Solo por hora; estadia y jornada terminan solas (12 h / 24 h despues). */
  horaHasta: HoraHHmm | null;
}

/** Query de `GET /api/estacionamientos/:id/disponibilidad`. */
export interface ConsultaDisponibilidad {
  estacionamientoId: Id;
  fecha: FechaISO;
  tipoVehiculo?: TipoVehiculo | null;
}

/** Franja ofrecida por el backend para una fecha dada. */
export interface FranjaDisponible {
  horaDesde: HoraHHmm;
  horaHasta: HoraHHmm;
  disponible: boolean;
  cocherasLibres: number;
}

/** Estado del formulario de reserva mientras el usuario lo completa. */
export interface BorradorReserva {
  estacionamientoId: Id | null;
  vehiculoId: Id | null;
  modalidad: ModalidadReserva;
  fecha: FechaISO | null;
  horaDesde: HoraHHmm | null;
  horaHasta: HoraHHmm | null;
}

export const BORRADOR_VACIO: BorradorReserva = {
  estacionamientoId: null,
  vehiculoId: null,
  modalidad: 'HORA',
  fecha: null,
  horaDesde: null,
  horaHasta: null,
};

/** Estados sobre los que el conductor todavia puede accionar. */
export const ESTADOS_ACTIVOS: EstadoReserva[] = ['PENDIENTE', 'CONFIRMADA', 'EN_CURSO'];

export function esReservaActiva(reserva: Reserva): boolean {
  return ESTADOS_ACTIVOS.includes(reserva.estado);
}
