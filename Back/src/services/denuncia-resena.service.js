// Denuncia de reseñas (Sprint 3). La parte calificada denuncia una reseña una
// vez: el propietario las de su estacionamiento (autor CONDUCTOR) y el
// conductor las que le dejaron (autor PROPIETARIO). Sigue contando hasta que el
// administrador la oculte; desestimada, queda firme.
import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../utils/roles.js';

export const MOTIVOS_DENUNCIA = Object.freeze(['OFENSIVA', 'FALSA', 'DATOS_PERSONALES', 'OTRO']);

export const ESTADOS_DENUNCIA = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  DESESTIMADA: 'DESESTIMADA',
  OCULTA: 'OCULTA',
});

/** Si la reseña es sobre quien la denuncia, segun el perfil con el que entro. */
function esSobre(usuario, resena) {
  if (usuario.rol === ROLES.PROPIETARIO) {
    return resena.autor === 'CONDUCTOR' && resena.id_propietario === usuario.id;
  }
  if (usuario.rol === ROLES.CONDUCTOR) {
    return resena.autor === 'PROPIETARIO' && resena.id_conductor === usuario.id;
  }
  return false;
}

export async function denunciar(idCalificacion, usuario, { motivo, detalle }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT q.id_calificacion, q.autor::text AS autor, q.id_conductor, q.denuncia_estado, e.id_propietario
         FROM calificacion q
         JOIN estacionamiento e ON e.id_estacionamiento = q.id_estacionamiento
        WHERE q.id_calificacion = $1
        FOR UPDATE OF q`,
      [idCalificacion],
    );
    const resena = rows[0];
    if (!resena) throw ApiError.notFound('La reseña no existe');
    if (!esSobre(usuario, resena)) {
      throw ApiError.forbidden('Solo podés denunciar reseñas sobre vos o tu estacionamiento');
    }
    if (resena.denuncia_estado) throw ApiError.conflict('Esta reseña ya fue denunciada');

    const { rows: denunciadas } = await client.query(
      `UPDATE calificacion
          SET denuncia_estado = $2, denuncia_motivo = $3, denuncia_detalle = $4, denunciada_at = now()
        WHERE id_calificacion = $1
        RETURNING id_calificacion, denuncia_estado::text AS denuncia_estado,
                  denuncia_motivo::text AS denuncia_motivo, denunciada_at`,
      [idCalificacion, ESTADOS_DENUNCIA.PENDIENTE, motivo, detalle ?? null],
    );
    return denunciadas[0];
  });
}

/* ------------------------------ moderacion ------------------------------ */

/** Lo que muestra la cola del administrador de cada reseña denunciada. */
const COLUMNAS_DENUNCIA = `
  q.id_calificacion, q.autor::text AS autor, q.puntaje, q.etiquetas, q.comentario, q.created_at,
  ROUND(COALESCE((q.limpieza + q.infraestructura + q.atencion + q.seguridad + q.acceso) / 5.0, q.puntaje)::numeric, 1)::float
    AS promedio,
  q.oculta, q.denuncia_estado::text AS denuncia_estado, q.denuncia_motivo::text AS denuncia_motivo,
  q.denuncia_detalle, q.denunciada_at, q.moderada_at,
  e.id_estacionamiento, e.nombre AS estacionamiento,
  q.id_conductor, u.nombre || ' ' || u.apellido AS conductor_nombre`;

const JOINS_DENUNCIA = `
  FROM calificacion q
  JOIN estacionamiento e ON e.id_estacionamiento = q.id_estacionamiento
  JOIN usuario u         ON u.id_usuario = q.id_conductor`;

/** Las denuncias en ese estado, la mas vieja primero. */
export async function listarDenuncias({ estado = ESTADOS_DENUNCIA.PENDIENTE } = {}) {
  const { rows } = await query(
    `SELECT ${COLUMNAS_DENUNCIA} ${JOINS_DENUNCIA}
      WHERE q.denuncia_estado = $1
      ORDER BY q.denunciada_at, q.id_calificacion`,
    [estado],
  );
  return rows;
}

/**
 * El administrador resuelve una denuncia pendiente: DESESTIMAR la cierra sin
 * cambiar nada; OCULTAR saca la reseña de la reputacion y de los listados.
 */
export async function moderar(idCalificacion, idAdmin, accion) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT denuncia_estado FROM calificacion WHERE id_calificacion = $1 FOR UPDATE',
      [idCalificacion],
    );
    if (!rows[0]) throw ApiError.notFound('La reseña no existe');
    if (rows[0].denuncia_estado !== ESTADOS_DENUNCIA.PENDIENTE) {
      throw ApiError.conflict('Esta denuncia ya fue resuelta');
    }

    const ocultar = accion === 'OCULTAR';
    await client.query(
      `UPDATE calificacion
          SET denuncia_estado = $2, oculta = $3, moderada_por = $4, moderada_at = now()
        WHERE id_calificacion = $1`,
      [idCalificacion, ocultar ? ESTADOS_DENUNCIA.OCULTA : ESTADOS_DENUNCIA.DESESTIMADA, ocultar, idAdmin],
    );
    const { rows: moderadas } = await client.query(
      `SELECT ${COLUMNAS_DENUNCIA} ${JOINS_DENUNCIA} WHERE q.id_calificacion = $1`,
      [idCalificacion],
    );
    return moderadas[0];
  });
}
