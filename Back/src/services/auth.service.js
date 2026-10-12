import bcrypt from 'bcrypt';

import { config } from '../config/env.js';
import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { firmarToken } from '../utils/jwt.js';
import { ESTADOS_VIGENTES } from '../utils/roles.js';

// `roles` va como text[]: el driver no sabe leer arreglos de un ENUM propio y
// los devolveria como el texto crudo '{CONDUCTOR,PROPIETARIO}'.
const CAMPOS_PUBLICOS = `
  id_usuario, nombre, apellido, email, rol, roles::text[] AS roles, telefono, activo, created_at
`;

const VIOLACION_UNIQUE = '23505';

const CAMPOS_EDITABLES = ['nombre', 'apellido', 'email', 'telefono'];

export async function registrar({ nombre, apellido, email, password, rol, telefono = null }) {
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  let usuario;
  try {
    const { rows } = await query(
      `INSERT INTO usuario (nombre, apellido, email, password_hash, rol, roles, telefono)
       VALUES ($1, $2, $3, $4, $5, ARRAY[$5]::rol_usuario[], $6)
       RETURNING ${CAMPOS_PUBLICOS}`,
      [nombre, apellido, email, passwordHash, rol, telefono],
    );
    usuario = rows[0];
  } catch (error) {
    if (error.code === VIOLACION_UNIQUE) {
      throw ApiError.conflict('Ya existe un usuario registrado con ese email');
    }
    throw error;
  }

  return { usuario, token: firmarToken(usuario) };
}

export async function login({ email, password }) {
  const { rows } = await query(
    `SELECT ${CAMPOS_PUBLICOS}, password_hash FROM usuario WHERE email = $1`,
    [email],
  );

  const usuario = rows[0];

  // Se compara igual cuando el usuario no existe para no filtrar por tiempo
  // que emails estan registrados.
  const hash = usuario?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const coincide = await bcrypt.compare(password, hash);

  if (!usuario || !coincide) {
    throw ApiError.unauthorized('Email o contrasena incorrectos');
  }

  if (!usuario.activo) {
    throw ApiError.forbidden('El usuario esta dado de baja');
  }

  delete usuario.password_hash;
  return { usuario, token: firmarToken(usuario) };
}

export async function obtenerPerfil(idUsuario) {
  const { rows } = await query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id_usuario = $1`,
    [idUsuario],
  );

  if (!rows[0]) throw ApiError.notFound('Usuario no encontrado');
  return rows[0];
}

/**
 * Cambia el perfil activo entre los que el usuario tiene habilitados y devuelve
 * un token nuevo: el rol viaja firmado, asi que el anterior deja de servir.
 */
export async function cambiarRol(idUsuario, rolNuevo) {
  const usuario = await obtenerPerfil(idUsuario);

  if (!usuario.roles.includes(rolNuevo)) {
    throw ApiError.forbidden(`El usuario no tiene habilitado el perfil ${rolNuevo}`);
  }

  const { rows } = await query(
    `UPDATE usuario SET rol = $1 WHERE id_usuario = $2 RETURNING ${CAMPOS_PUBLICOS}`,
    [rolNuevo, idUsuario],
  );

  return { usuario: rows[0], token: firmarToken(rows[0]) };
}

/**
 * Actualiza los datos propios. Solo viajan los campos presentes; para cambiar
 * la contrasena hay que mandar tambien la actual. Si se quita el perfil activo,
 * queda activo el primero de los que sigan habilitados.
 *
 * Devuelve un token nuevo porque el rol activo puede haber cambiado.
 */
export async function actualizarPerfil(idUsuario, cambios) {
  return withTransaction(async (client) => {
    const { rows: actuales } = await client.query(
      `SELECT ${CAMPOS_PUBLICOS}, password_hash FROM usuario WHERE id_usuario = $1 FOR UPDATE`,
      [idUsuario],
    );

    const actual = actuales[0];
    if (!actual) throw ApiError.notFound('Usuario no encontrado');

    const sets = [];
    const valores = [];

    for (const campo of CAMPOS_EDITABLES) {
      if (cambios[campo] === undefined) continue;
      valores.push(cambios[campo]);
      sets.push(`${campo} = $${valores.length}`);
    }

    if (cambios.password !== undefined) {
      const coincide = await bcrypt.compare(cambios.passwordActual ?? '', actual.password_hash);
      if (!coincide) throw ApiError.unauthorized('La contrasena actual no coincide');

      valores.push(await bcrypt.hash(cambios.password, config.bcryptRounds));
      sets.push(`password_hash = $${valores.length}`);
    }

    if (cambios.roles !== undefined) {
      valores.push(cambios.roles);
      sets.push(`roles = $${valores.length}::rol_usuario[]`);

      if (!cambios.roles.includes(actual.rol)) {
        valores.push(cambios.roles[0]);
        sets.push(`rol = $${valores.length}`);
      }
    }

    if (sets.length === 0) {
      delete actual.password_hash;
      return { usuario: actual, token: firmarToken(actual) };
    }

    valores.push(idUsuario);

    let usuario;
    try {
      const { rows } = await client.query(
        `UPDATE usuario SET ${sets.join(', ')}
          WHERE id_usuario = $${valores.length}
          RETURNING ${CAMPOS_PUBLICOS}`,
        valores,
      );
      usuario = rows[0];
    } catch (error) {
      if (error.code === VIOLACION_UNIQUE) {
        throw ApiError.conflict('Ya existe un usuario registrado con ese email');
      }
      throw error;
    }

    return { usuario, token: firmarToken(usuario) };
  });
}

/**
 * Baja de la cuenta. Es logica: las reservas viejas siguen siendo historia, asi
 * que en vez de borrar filas se cancela lo que todavia no paso y se desactiva
 * todo lo del usuario (vehiculos, estacionamientos y la cuenta).
 */
export async function eliminarCuenta(idUsuario) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT activo FROM usuario WHERE id_usuario = $1 FOR UPDATE',
      [idUsuario],
    );

    if (!rows[0]) throw ApiError.notFound('Usuario no encontrado');
    if (!rows[0].activo) throw ApiError.conflict('La cuenta ya esta dada de baja');

    // Reservas futuras que hizo como conductor.
    await client.query(
      `UPDATE reserva SET estado = 'CANCELADA', cancelada_por = 'CONDUCTOR'
        WHERE id_conductor = $1 AND estado = ANY($2::estado_reserva[]) AND fin > now()`,
      [idUsuario, ESTADOS_VIGENTES],
    );

    // Reservas futuras que recibio en sus cocheras.
    await client.query(
      `UPDATE reserva r SET estado = 'CANCELADA', cancelada_por = 'PROPIETARIO'
         FROM cochera c
         JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
        WHERE c.id_cochera = r.id_cochera
          AND e.id_propietario = $1
          AND r.estado = ANY($2::estado_reserva[])
          AND r.fin > now()`,
      [idUsuario, ESTADOS_VIGENTES],
    );

    await client.query(
      'UPDATE vehiculo SET activo = FALSE, predeterminado = FALSE WHERE id_conductor = $1',
      [idUsuario],
    );
    await client.query('UPDATE estacionamiento SET activo = FALSE WHERE id_propietario = $1', [
      idUsuario,
    ]);
    await client.query('UPDATE usuario SET activo = FALSE WHERE id_usuario = $1', [idUsuario]);
  });
}
