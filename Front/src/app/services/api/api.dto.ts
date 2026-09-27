import { EstadoCochera, ModalidadReserva, RolUsuario } from '@app/models';

/*
 * Forma exacta de las respuestas de la API de Express (snake_case, tal cual
 * salen de PostgreSQL). Solo las usan los mapeos de `api.mapeo.ts`: el resto de
 * la app trabaja con los modelos de `models/`.
 */

// EN_CURSO lo arma el backend: es una reserva CONFIRMADA con ingreso registrado.
export type EstadoReservaDto =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'EN_CURSO'
  | 'CANCELADA'
  | 'FINALIZADA';

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
  cubierto: boolean;
  publicado: boolean;
  activo: boolean;
  cocheras_activas?: number;
  cocheras_libres?: number;
  tipos_vehiculo?: number[];
  horarios?: HorarioDto[];
  /** Cuando se subio la foto. `null` o ausente si el estacionamiento no tiene. */
  foto_actualizada?: string | null;
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
}

export interface ReservaDto {
  id_reserva: string;
  id_conductor: string;
  inicio: string;
  fin: string;
  estado: EstadoReservaDto;
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
  modalidad: ModalidadReserva;
}

export interface FranjaDto {
  hora_desde: string;
  hora_hasta: string;
  disponible: boolean;
  cocheras_libres: number;
  motivo: string | null;
}
