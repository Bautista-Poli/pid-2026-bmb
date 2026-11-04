// Denuncia de reseñas (Sprint 3). La parte calificada denuncia una reseña una
// vez: el propietario las de su estacionamiento (autor CONDUCTOR) y el
// conductor las que le dejaron (autor PROPIETARIO). Sigue contando hasta que el
// administrador la oculte; desestimada, queda firme.
import { withTransaction } from '../config/database.js';
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
