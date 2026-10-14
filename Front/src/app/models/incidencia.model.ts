import { FechaHoraISO, FechaISO, Id } from './api.model';
import { TurnoAbono } from './abono.model';
import { EstadoReserva, OrigenCancelacion } from './reserva.model';

/**
 * Problema de una reserva que el propietario tiene que ver. Las crea el
 * sistema: un auto que se paso de su horario y sigue adentro (la cochera queda
 * bloqueada hasta el egreso), o una reserva que no se pudo reasignar porque su
 * cochera seguia ocupada.
 */
export type TipoIncidencia = 'AUTO_EXCEDIDO' | 'RESERVA_AFECTADA' | 'RECLAMO';

/**
 * DENUNCIADA: alguna de las partes la escalo a la moderacion. RETIRADA: el
 * conductor retiro su reclamo.
 */
export type EstadoIncidencia = 'ABIERTA' | 'DENUNCIADA' | 'RESUELTA' | 'RETIRADA';

/** Por que reclama el conductor. */
export type MotivoReclamo = 'NO_HABIA_LUGAR' | 'COBRO_INCORRECTO' | 'DANO_AL_VEHICULO' | 'MAL_SERVICIO' | 'OTRO';

export const ETIQUETA_MOTIVO_RECLAMO: Record<MotivoReclamo, string> = {
  NO_HABIA_LUGAR: 'No había lugar',
  COBRO_INCORRECTO: 'Cobro incorrecto',
  DANO_AL_VEHICULO: 'Daño al vehículo',
  MAL_SERVICIO: 'Mal servicio',
  OTRO: 'Otro',
};

/** Como cerro la moderacion una incidencia denunciada. */
export type ResolucionIncidencia = 'A_FAVOR_CONDUCTOR' | 'A_FAVOR_PROPIETARIO';

export const ETIQUETA_RESOLUCION: Record<ResolucionIncidencia, string> = {
  A_FAVOR_CONDUCTOR: 'A favor del conductor',
  A_FAVOR_PROPIETARIO: 'A favor del estacionamiento',
};

/**
 * Chats de una incidencia. GENERAL: propietario y conductor (la moderacion
 * solo lee). PROPIETARIO / CONDUCTOR: chat privado de la moderacion con cada
 * parte; existen recien cuando alguno denuncia.
 */
export type CanalIncidencia = 'GENERAL' | 'PROPIETARIO' | 'CONDUCTOR';

/** Quien escribio cada mensaje del hilo. */
export type AutorMensaje = 'SISTEMA' | 'PROPIETARIO' | 'CONDUCTOR' | 'ADMINISTRADOR';

export const ETIQUETA_TIPO_INCIDENCIA: Record<TipoIncidencia, string> = {
  AUTO_EXCEDIDO: 'Auto excedido',
  RESERVA_AFECTADA: 'Reserva sin cochera',
  RECLAMO: 'Reclamo',
};

export const ETIQUETA_ESTADO_INCIDENCIA: Record<EstadoIncidencia, string> = {
  ABIERTA: 'Abierta',
  DENUNCIADA: 'Denunciada',
  RESUELTA: 'Resuelta',
  RETIRADA: 'Retirada',
};

export const ETIQUETA_AUTOR: Record<AutorMensaje, string> = {
  SISTEMA: 'Parkit',
  PROPIETARIO: 'Estacionamiento',
  CONDUCTOR: 'Conductor',
  ADMINISTRADOR: 'Moderación',
};

export interface Incidencia {
  id: Id;
  tipo: TipoIncidencia;
  estado: EstadoIncidencia;
  creadaEn: FechaHoraISO;
  denunciadaEn: FechaHoraISO | null;
  /** Quien la escalo a la moderacion: PROPIETARIO o CONDUCTOR. */
  denunciadaPor: AutorMensaje | null;
  resueltaEn: FechaHoraISO | null;
  /** null en un reclamo sobre un abono. */
  reserva: {
    id: Id;
    inicio: FechaHoraISO;
    fin: FechaHoraISO;
    estado: EstadoReserva;
    egresoEn: FechaHoraISO | null;
  } | null;
  /** Solo en un reclamo sobre un abono. */
  abono: { id: Id; desde: FechaISO; hasta: FechaISO; turno: TurnoAbono } | null;
  conductor: { id: Id; nombre: string };
  /** null en un reclamo sobre un abono. */
  patente: string | null;
  cochera: string | null;
  /** Solo en un reclamo. */
  motivo: MotivoReclamo | null;
  montoPedido: number | null;
  /** La ultima devolucion que propuso el propietario (puede ser 0). */
  propuestaVigente: number | null;
  /** Lo pagado por la reserva o el abono, lo ya devuelto y lo que queda por devolver. */
  pagado: number;
  devuelto: number;
  tope: number;
  resolucion: ResolucionIncidencia | null;
  estacionamiento: { id: Id; nombre: string };
  cantidadMensajes: number;
  ultimoMensaje: string | null;
}

export interface MensajeIncidencia {
  id: Id;
  canal: CanalIncidencia;
  rolAutor: AutorMensaje;
  /** Nombre de quien lo escribio; null en los del sistema. */
  autor: string | null;
  texto: string;
  creadoEn: FechaHoraISO;
  /** Devolucion que propuso el propietario con este mensaje. */
  montoPropuesto: number | null;
}

export interface IncidenciaDetallada extends Incidencia {
  /** Chats que puede ver quien consulta: el general y, si se denuncio, el suyo con la moderacion. */
  canales: CanalIncidencia[];
  mensajes: MensajeIncidencia[];
}

/** Lo que pide el conductor al abrir un reclamo (sobre una reserva o un abono). */
export interface NuevoReclamo {
  reservaId?: Id;
  abonoId?: Id;
  motivo: MotivoReclamo;
  montoPedido?: number;
  texto: string;
}

/** Lo que ve la moderacion para decidir: los horarios reales de la reserva, o el periodo del abono. */
export interface ResumenModeracion {
  inicio?: FechaHoraISO;
  fin?: FechaHoraISO;
  ingresoEn?: FechaHoraISO | null;
  egresoEn?: FechaHoraISO | null;
  estadoReserva?: EstadoReserva;
  canceladaPor?: OrigenCancelacion | null;
  desde?: FechaISO;
  hasta?: FechaISO;
}

/** Detalle de una incidencia para el administrador: los tres chats y el resumen. */
export interface IncidenciaModerada extends IncidenciaDetallada {
  resumen: ResumenModeracion;
}
