import { FechaISO, HoraHHmm, Id } from './api.model';
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

/**
 * Cuando quiere estacionar el conductor: en este instante o en una franja de un
 * dia. Es lo primero que se pregunta al explorar.
 */
export type Momento =
  | { tipo: 'AHORA' }
  | { tipo: 'FRANJA'; fecha: FechaISO; horaDesde: HoraHHmm; horaHasta: HoraHHmm };

/**
 * Desde donde busca el conductor: su ubicacion actual (ordena por distancia,
 * calculada en el front) u otra zona escrita a mano (usa el filtro `zona`).
 */
export type Ubicacion =
  | { tipo: 'ACTUAL'; latitud: number; longitud: number }
  | { tipo: 'OTRA'; zona: string };

/** Filtros del listado: los resuelve todos la API, incluida la disponibilidad del `momento`. */
export interface FiltrosEstacionamiento {
  busqueda?: string;
  zona?: string;
  tipoVehiculo?: TipoVehiculo | null;
  precioMinimo?: number | null;
  precioMaximo?: number | null;
  soloCubiertos?: boolean;
  momento?: Momento | null;
  /** Coordenadas del conductor, para calcular `distanciaKm` en el front. No se manda a la API. */
  origen?: { latitud: number; longitud: number } | null;
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
