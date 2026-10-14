import { ROLES } from '../utils/roles.js';
import { campos } from './helpers.js';

// Los perfiles que cualquiera puede elegir. El de administrador no: lo crea el
// script db:crear-admin y no se combina con los demas.
const PERFILES = [ROLES.CONDUCTOR, ROLES.PROPIETARIO];

export function validarRegistro(body) {
  return campos(body)
    .texto('nombre', body.nombre, { min: 2, max: 80 })
    .texto('apellido', body.apellido, { min: 2, max: 80 })
    .email('email', body.email)
    // bcrypt ignora lo que pase de 72 bytes, por eso el tope.
    .texto('password', body.password, { min: 8, max: 72 })
    .enumerado('rol', body.rol, PERFILES)
    .texto('telefono', body.telefono, { requerido: false, max: 30 })
    .resultado();
}

export function validarLogin(body) {
  return campos(body)
    .email('email', body.email)
    .texto('password', body.password, { min: 1, max: 72 })
    .resultado();
}

export function validarCambioRol(body) {
  return campos(body).enumerado('rol', body.rol, PERFILES).resultado();
}

/** PATCH del perfil: todo opcional, pero la contrasena nueva exige la actual. */
export function validarCambiosPerfil(body) {
  const { valores, errores } = campos(body)
    .texto('nombre', body.nombre, { requerido: false, min: 2, max: 80 })
    .texto('apellido', body.apellido, { requerido: false, min: 2, max: 80 })
    .email('email', body.email, { requerido: false })
    .texto('telefono', body.telefono, { requerido: false, max: 30 })
    .texto('password', body.password, { requerido: false, min: 8, max: 72 })
    .texto('passwordActual', body.passwordActual, { requerido: false, min: 1, max: 72 })
    .resultado();

  if (valores.password && !valores.passwordActual) {
    errores.push({ campo: 'passwordActual', mensaje: 'es obligatoria para cambiar la contrasena' });
  }

  if (body.roles !== undefined) {
    const roles = Array.isArray(body.roles) ? [...new Set(body.roles)] : null;

    if (!roles || roles.length === 0) {
      errores.push({ campo: 'roles', mensaje: 'tiene que ser una lista con al menos un perfil' });
    } else if (roles.some((rol) => !PERFILES.includes(rol))) {
      errores.push({ campo: 'roles', mensaje: `cada perfil debe ser uno de: ${PERFILES.join(', ')}` });
    } else {
      valores.roles = roles;
    }
  }

  return { valores, errores };
}
