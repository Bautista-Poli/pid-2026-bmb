import { MotivoReclamo, ResolucionIncidencia } from '@app/models';
import {
  EstadoAbono,
  EstadoAprobacion,
  EstadoCochera,
  ModalidadReserva,
  RolUsuario,
  TurnoAbono,
} from '@app/models';

/*
 * Forma exacta de las respuestas de la API de Express (snake_case, tal cual
 * salen de PostgreSQL). Solo las usan los mapeos de `api.mapeo.ts`: el resto de
 * la app trabaja con los modelos de `models/`.
 */

export type EstadoReservaDto =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'ACTIVA'
  | 'CANCELADA'
  | 'FINALIZADA'
  | 'NO_SHOW';

export interface UsuarioDto {
  id_usuario: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: RolUsuario;
  roles: RolUsuario[];
  telefono: string | null;
  activo: boolean;
  created_at: string;
}

export interface HorarioDto {
  /** 0 = domingo. */
  dia_semana: number;
  /** `08:00` o `08:00:00`. */
  hora_apertura: string;
  hora_cierre: string;
}

export interface CocheraDto {
  id_cochera: string;
  id_estacionamiento: string;
  identificador: string;
  sector: string | null;
  cubierta: boolean;
  estado_actual: EstadoCochera;
  activo: boolean;
  id_tipo_vehiculo: number;
  reservada_ahora?: boolean;
  bloqueada: boolean;
  motivo_bloqueo: string | null;
  bloqueada_hasta: string | null;
}

/** `GET /api/admin/estacionamientos`: el estacionamiento con su propietario. */
export interface EstacionamientoEnRevisionDto extends EstacionamientoDto {
  propietario: { nombre: string; apellido: string; email: string; telefono: string | null };
}

export interface EstacionamientoDto {
  id_estacionamiento: string;
  id_propietario: string;
  nombre: string;
  descripcion: string | null;
  /** `calle numero`, armada por el backend. */
  direccion: string;
  calle: string | null;
  numero: string | null;
  ciudad: string | null;
  provincia: string | null;
  codigo_postal: string | null;
  barrio_zona: string | null;
  latitud: number | null;
  longitud: number | null;
  telefono_contacto: string | null;
  email_contacto: string | null;
  tarifa_hora: number | null;
  tarifa_estadia: number | null;
  tarifa_jornada: number | null;
  /** Horas minimas de anticipacion para cancelar una reserva ya confirmada. `null` = sin restriccion. */
  politica_cancelacion_horas: number | null;
  cubierto: boolean;
  publicado: boolean;
  activo: boolean;
  estado_aprobacion: EstadoAprobacion;
  motivo_rechazo: string | null;
  enviado_en: string;
  cocheras_activas?: number;
  cocheras_libres?: number;
  /** Solo con `incluir_no_disponibles`: si tiene cochera libre para el tipo y esta abierto en ese momento. */
  disponible?: boolean;
  tipos_vehiculo?: number[];
  horarios?: HorarioDto[];
  /** Cuando se subio la portada. `null` o ausente si el estacionamiento no tiene. */
  foto_actualizada?: string | null;
  /** La galeria en orden; la primera es la portada. */
  fotos?: { id_foto: string; actualizada: string }[];
}

export interface VehiculoDto {
  id_vehiculo: string;
  id_conductor: string;
  id_tipo_vehiculo: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  predeterminado: boolean;
  activo: boolean;
  /** URL de la foto propia en Cloudinary, o `null`. */
  foto_url?: string | null;
  foto_miniatura_url?: string | null;
}

export interface ReservaDto {
  id_reserva: string;
  id_conductor: string;
  inicio: string;
  fin: string;
  estado: EstadoReservaDto;
  cancelada_por: 'CONDUCTOR' | 'PROPIETARIO' | 'SISTEMA' | null;
  created_at: string;
  ingreso_real: string | null;
  egreso_real: string | null;
  id_vehiculo: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  id_tipo_vehiculo: number;
  id_cochera: string;
  cochera: string;
  cochera_sector: string | null;
  cochera_cubierta: boolean;
  id_estacionamiento: string;
  estacionamiento: string;
  direccion: string;
  precio_total: number;
  modalidad: ModalidadReserva | 'ABONO';
  motivo_reasignacion: string | null;
  /** Solo en las respuestas al conductor. */
  codigo_acceso?: string;
  id_abono: string | null;
  turno_abono: TurnoAbono | null;
  devuelto?: number;
  reclamo_abierto?: string | null;
}

export interface AccesoReservaDto {
  accion: 'INGRESO' | 'EGRESO';
  reserva: ReservaDto;
}

export interface FranjaDto {
  hora_desde: string;
  hora_hasta: string;
  disponible: boolean;
  cocheras_libres: number;
  motivo: string | null;
  fecha_hasta?: string;
  causa?: 'HORARIO' | 'PASADO' | 'SIN_COCHERA' | null;
}

export interface PlanAbonoDto {
  id_plan: string;
  id_estacionamiento: string;
  turno: TurnoAbono;
  cupos: number;
  precio: number;
  activo: boolean;
}

export interface AbonoDto {
  id_abono: string;
  id_conductor: string;
  conductor_nombre: string;
  conductor_apellido: string;
  id_estacionamiento: string;
  estacionamiento: string;
  id_plan: string;
  turno: TurnoAbono;
  cupos_totales: number;
  cupos_usados: number;
  cupos_restantes: number;
  precio_total: number;
  desde: string;
  hasta: string;
  estado: EstadoAbono;
  created_at: string;
  devuelto?: number;
  reclamo_abierto?: string | null;
}

export interface IncidenciaDto {
  id_incidencia: string;
  tipo: 'AUTO_EXCEDIDO' | 'RESERVA_AFECTADA' | 'RECLAMO';
  estado: 'ABIERTA' | 'DENUNCIADA' | 'RESUELTA' | 'RETIRADA';
  created_at: string;
  denunciada_at: string | null;
  denunciada_por: 'PROPIETARIO' | 'CONDUCTOR' | null;
  resuelta_at: string | null;
  id_reserva: string | null;
  inicio: string | null;
  fin: string | null;
  estado_reserva: EstadoReservaDto | null;
  egreso_real: string | null;
  id_abono: string | null;
  abono_desde: string | null;
  abono_hasta: string | null;
  abono_turno: TurnoAbono | null;
  id_conductor: string;
  conductor_nombre: string;
  conductor_apellido: string;
  patente: string | null;
  cochera: string | null;
  id_estacionamiento: string;
  estacionamiento: string;
  cantidad_mensajes?: number;
  ultimo_mensaje?: string | null;
  motivo: MotivoReclamo | null;
  monto_pedido: number | null;
  propuesta_vigente: number | null;
  pagado: number;
  devuelto: number;
  tope: number;
  resolucion: ResolucionIncidencia | null;
}

export interface MensajeIncidenciaDto {
  id_mensaje: string;
  canal: 'GENERAL' | 'PROPIETARIO' | 'CONDUCTOR';
  rol_autor: 'SISTEMA' | 'PROPIETARIO' | 'CONDUCTOR' | 'ADMINISTRADOR';
  texto: string;
  created_at: string;
  autor_nombre: string | null;
  autor_apellido: string | null;
  monto_propuesto: number | null;
}

export interface IncidenciaDetalladaDto extends IncidenciaDto {
  canales: ('GENERAL' | 'PROPIETARIO' | 'CONDUCTOR')[];
  mensajes: MensajeIncidenciaDto[];
}

export interface IncidenciaModeradaDto extends IncidenciaDetalladaDto {
  resumen: {
    inicio?: string;
    fin?: string;
    ingreso_real?: string | null;
    egreso_real?: string | null;
    estado_reserva?: EstadoReservaDto;
    cancelada_por?: 'CONDUCTOR' | 'PROPIETARIO' | 'SISTEMA' | null;
    desde?: string;
    hasta?: string;
  };
}
