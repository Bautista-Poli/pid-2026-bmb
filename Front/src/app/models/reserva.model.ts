import { TurnoAbono } from './abono.model';
import { FechaHoraISO, FechaISO, HoraHHmm, Id } from './api.model';
import { Cochera } from './cochera.model';
import { Estacionamiento } from './estacionamiento.model';
import { ModalidadReserva } from './tarifa.model';
import { TipoVehiculo, Vehiculo } from './vehiculo.model';

export type EstadoReserva =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'ACTIVA'
  | 'FINALIZADA'
  | 'CANCELADA'
  /** El vehiculo no llego dentro de la tolerancia: la cochera se libero. */
  | 'NO_SHOW';

export const ETIQUETA_ESTADO_RESERVA: Record<EstadoReserva, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  ACTIVA: 'En curso',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  NO_SHOW: 'Ausente',
};

/**
 * Quien cancelo la reserva. SISTEMA: estaba PENDIENTE y el propietario no la
 * confirmo antes de su inicio. null: no se cancelo, o se cancelo antes de que
 * se guardara el dato.
 */
export type OrigenCancelacion = 'CONDUCTOR' | 'PROPIETARIO' | 'SISTEMA';

/** Pendiente que el propietario no confirmo a tiempo: la cancelo el sistema. */
export function esExpirada(reserva: Pick<Reserva, 'estado' | 'canceladaPor'>): boolean {
  return reserva.estado === 'CANCELADA' && reserva.canceladaPor === 'SISTEMA';
}

/**
 * Texto del estado, distinguiendo quien cancelo: el propietario tiene que
 * saber si fue el conductor, el estacionamiento o el sistema (Expirada).
 * `vista` es quien mira: al conductor no se le dice "por el conductor".
 */
export function etiquetaReserva(
  reserva: Pick<Reserva, 'estado' | 'canceladaPor'>,
  vista: 'CONDUCTOR' | 'PROPIETARIO' = 'PROPIETARIO',
): string {
  if (reserva.estado !== 'CANCELADA') return ETIQUETA_ESTADO_RESERVA[reserva.estado];
  switch (reserva.canceladaPor) {
    case 'SISTEMA':
      return 'Expirada';
    case 'CONDUCTOR':
      return vista === 'CONDUCTOR' ? 'Cancelada' : 'Cancelada por el conductor';
    case 'PROPIETARIO':
      return vista === 'PROPIETARIO' ? 'Cancelada por vos' : 'Cancelada por el estacionamiento';
    default:
      return 'Cancelada';
  }
}

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
  /** Solo en una CANCELADA: quien la cancelo (ver `etiquetaReserva`). */
  canceladaPor: OrigenCancelacion | null;
  precioTotal: number;
  creadaEn: FechaHoraISO;
  /** Horas reales que registra el propietario. */
  ingresoEn: FechaHoraISO | null;
  egresoEn: FechaHoraISO | null;
  /** Aviso cuando el bloqueo de la cochera original la reasignó o, sin alternativa, la canceló. */
  motivoReasignacion: string | null;
  /** Codigo del QR de la reserva: lo muestra el conductor y lo escanea el operador. */
  codigoAcceso: string;
  /** Con que abono se hizo, o null si se pago aparte. */
  abono: { id: Id; turno: TurnoAbono } | null;
  /** Lo devuelto por reclamos (simulado). */
  devuelto: number;
  /** El reclamo abierto o denunciado sobre esta reserva, si hay. */
  reclamoAbierto: Id | null;
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
  /** Con modalidad (y `horas` si es por hora) devuelve un ingreso por cada hora del dia. */
  modalidad?: ModalidadReserva;
  horas?: number;
}

/** Por que no se puede reservar una franja. */
export type CausaNoDisponible = 'HORARIO' | 'PASADO' | 'SIN_COCHERA';

/** Franja ofrecida por el backend para una fecha dada. */
export interface FranjaDisponible {
  horaDesde: HoraHHmm;
  horaHasta: HoraHHmm;
  /** Dia en que termina: distinto de la fecha pedida si pasa de la medianoche. */
  fechaHasta: FechaISO | null;
  disponible: boolean;
  cocherasLibres: number;
  causa: CausaNoDisponible | null;
}

/** Estado del formulario de reserva mientras el usuario lo completa. */
export interface BorradorReserva {
  estacionamientoId: Id | null;
  vehiculoId: Id | null;
  modalidad: ModalidadReserva;
  fecha: FechaISO | null;
  horaDesde: HoraHHmm | null;
  horaHasta: HoraHHmm | null;
  /** Horas a reservar. 12 y 24 pueden ser estadia y jornada (ver `modalidadPorHoras`). */
  horas: number;
}

export const BORRADOR_VACIO: BorradorReserva = {
  estacionamientoId: null,
  vehiculoId: null,
  modalidad: 'HORA',
  fecha: null,
  horaDesde: null,
  horaHasta: null,
  horas: 2,
};

/** Estados sobre los que el conductor todavia puede accionar. */
export const ESTADOS_ACTIVOS: EstadoReserva[] = ['PENDIENTE', 'CONFIRMADA', 'ACTIVA'];

export function esReservaActiva(reserva: Reserva): boolean {
  return ESTADOS_ACTIVOS.includes(reserva.estado);
}

/** Lo que registra el QR de la reserva segun su estado. */
export type AccionAcceso = 'INGRESO' | 'EGRESO';

/** Vista previa (`GET /reservas/acceso/:codigo`) y resultado (`POST /reservas/acceso`). */
export interface AccesoReserva {
  accion: AccionAcceso;
  reserva: ReservaDetallada;
}
