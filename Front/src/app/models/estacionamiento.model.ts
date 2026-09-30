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
  /** Horas minimas de anticipacion para cancelar una reserva confirmada. `null` = sin restriccion. */
  politicaCancelacionHoras: number | null;
  /** Derivados del agregado de Cochera, los calcula el backend. */
  cocherasTotales: number;
  /** Cocheras libres en este momento. */
  cocherasDisponibles: number;
  /**
   * Si tiene lugar para el tipo pedido y esta abierto en el momento buscado.
   * Solo viene al buscar con `incluirNoDisponibles`.
   */
  disponible?: boolean;
  tiposAdmitidos: TipoVehiculo[];
  cubierto: boolean;
  /** URL publica de la portada (la primera foto), o `null` si no cargo ninguna. */
  fotoUrl: string | null;
  /** URLs de todas las fotos, en orden; la primera es la portada. */
  fotos: string[];
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
 * Desde donde busca el conductor:
 * - `ACTUAL`: su ubicacion (ordena por distancia, calculada en el front).
 * - `DIRECCION`: una direccion real elegida de las sugerencias ("Av Pueyrredon
 *   2409"); ordena por distancia a ese punto, como si estuviera ahi.
 * - `OTRA`: una zona escrita a mano sin elegir direccion (usa el filtro `zona`).
 */
export type Ubicacion =
  | { tipo: 'ACTUAL'; latitud: number; longitud: number }
  | { tipo: 'DIRECCION'; direccion: string; latitud: number; longitud: number }
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
  /** Con un momento: trae tambien los que no tienen lugar o estan cerrados, marcados con `disponible`. */
  incluirNoDisponibles?: boolean;
  /** Solo los que caen en este rectangulo: la parte del mapa que se esta viendo. */
  area?: AreaMapa | null;
  /** Coordenadas del conductor, para calcular `distanciaKm` en el front. No se manda a la API. */
  origen?: { latitud: number; longitud: number } | null;
  orden?: OrdenEstacionamiento;
}

/** Rectangulo del mapa, en grados. */
export interface AreaMapa {
  latitudMinima: number;
  latitudMaxima: number;
  longitudMinima: number;
  longitudMaxima: number;
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
  politicaCancelacionHoras?: number | null;
  cubierto?: boolean;
  publicado: boolean;
  horarios: FranjaAtencion[];
}

export function direccionCorta(direccion: Direccion): string {
  return `${direccion.calle} ${direccion.numero}, ${direccion.ciudad}`;
}
