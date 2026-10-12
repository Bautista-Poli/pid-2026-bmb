import { FechaHoraISO, Id } from './api.model';
import { EstadoReserva } from './reserva.model';

/**
 * Problema de una reserva que el propietario tiene que ver. Las crea el
 * sistema: un auto que se paso de su horario y sigue adentro (la cochera queda
 * bloqueada hasta el egreso), o una reserva que no se pudo reasignar porque su
 * cochera seguia ocupada.
 */
export type TipoIncidencia = 'AUTO_EXCEDIDO' | 'RESERVA_AFECTADA';

/** DENUNCIADA: el propietario la escalo a la plataforma. */
export type EstadoIncidencia = 'ABIERTA' | 'DENUNCIADA' | 'RESUELTA';

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
};

export const ETIQUETA_ESTADO_INCIDENCIA: Record<EstadoIncidencia, string> = {
  ABIERTA: 'Abierta',
  DENUNCIADA: 'Denunciada',
  RESUELTA: 'Resuelta',
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
  reserva: {
    id: Id;
    inicio: FechaHoraISO;
    fin: FechaHoraISO;
    estado: EstadoReserva;
    egresoEn: FechaHoraISO | null;
  };
  conductor: { id: Id; nombre: string };
  patente: string;
  cochera: string;
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
}

export interface IncidenciaDetallada extends Incidencia {
  /** Chats que puede ver quien consulta: el general y, si se denuncio, el suyo con la moderacion. */
  canales: CanalIncidencia[];
  mensajes: MensajeIncidencia[];
}
