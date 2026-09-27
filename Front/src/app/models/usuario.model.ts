import { FechaHoraISO, Id } from './api.model';

export type RolUsuario = 'CONDUCTOR' | 'PROPIETARIO';

export const ETIQUETA_ROL: Record<RolUsuario, string> = {
  CONDUCTOR: 'Conductor',
  PROPIETARIO: 'Propietario',
};

export interface Usuario {
  id: Id;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  /** Perfil activo de la sesion: define que rama de rutas se ve. */
  rol: RolUsuario;
  /** Perfiles habilitados. Con mas de uno, el usuario puede alternar entre ellos. */
  roles: RolUsuario[];
  fechaAlta: FechaHoraISO;
  activo: boolean;
}

/** Payload de `POST /api/auth/login`. */
export interface Credenciales {
  email: string;
  password: string;
}

/** Payload de `POST /api/auth/register`. */
export interface RegistroUsuario {
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  password: string;
  rol: RolUsuario;
}

/** Payload de `PATCH /api/auth/me`: solo viajan los campos que se tocaron. */
export interface CambiosPerfil {
  nombre?: string;
  apellido?: string;
  email?: string;
  telefono?: string;
  roles?: RolUsuario[];
  password?: string;
  passwordActual?: string;
}

/** "M. Álvarez": el formato que usa el bloque de usuario del sidebar. */
export function nombreCorto(usuario: Usuario): string {
  return `${usuario.nombre.charAt(0)}. ${usuario.apellido}`;
}

export function iniciales(usuario: Usuario): string {
  return `${usuario.nombre.charAt(0)}${usuario.apellido.charAt(0)}`.toUpperCase();
}
