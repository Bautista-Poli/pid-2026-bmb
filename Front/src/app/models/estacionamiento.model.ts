import { HoraHHmm, Id } from './api.model';
import { Tarifas } from './tarifa.model';
import { TipoVehiculo } from './vehiculo.model';

export type DiaSemana =
  | 'LUNES'
  | 'MARTES'
  | 'MIERCOLES'
  | 'JUEVES'
  | 'VIERNES'
  | 'SABADO'
  | 'DOMINGO';

export interface FranjaAtencion {
  dia: DiaSemana;
  desde: HoraHHmm;
  hasta: HoraHHmm;
}

export interface Direccion {
  calle: string;
  numero: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  latitud: number | null;
  longitud: number | null;
}

/** Estacionamiento publicado por un usuario con rol PROPIETARIO. */
export interface Estacionamiento {
  id: Id;
  /** FK -> Usuario.id (rol PROPIETARIO). */
  propietarioId: Id;
  nombre: string;
  descripcion: string;
  direccion: Direccion;
  /** Barrio o zona, para la busqueda por zona. */
  barrioZona: string | null;
  telefonoContacto: string | null;
  emailContacto: string | null;
  horarios: FranjaAtencion[];
  tarifas: Tarifas;
  /** Derivados del agregado de Cochera, los calcula el backend. */
  cocherasTotales: number;
  /** Cocheras libres en este momento. */
  cocherasDisponibles: number;
  tiposAdmitidos: TipoVehiculo[];
  cubierto: boolean;
  /** URL publica de la foto que subio el propietario, o `null` si no cargo ninguna. */
  fotoUrl: string | null;
  /** Distancia al usuario en km. Solo viene en busquedas geolocalizadas. */
  distanciaKm?: number;
  publicado: boolean;
  activo: boolean;
}

/** Filtros del listado. Texto, tipo, precio y cubierto los resuelve la API. */
export interface FiltrosEstacionamiento {
  busqueda?: string;
  tipoVehiculo?: TipoVehiculo | null;
  precioMaximo?: number | null;
  soloCubiertos?: boolean;
  soloDisponibles?: boolean;
  orden?: OrdenEstacionamiento;
}

export type OrdenEstacionamiento = 'DISTANCIA' | 'PRECIO';

/** Payload de `POST /api/estacionamientos`. */
export interface NuevoEstacionamiento {
  nombre: string;
  descripcion?: string;
  direccion: Direccion;
  barrioZona?: string | null;
  telefonoContacto?: string | null;
  emailContacto?: string | null;
  tarifas: Tarifas;
  cubierto?: boolean;
  publicado: boolean;
  horarios: FranjaAtencion[];
}

export function direccionCorta(direccion: Direccion): string {
  return `${direccion.calle} ${direccion.numero}, ${direccion.ciudad}`;
}
