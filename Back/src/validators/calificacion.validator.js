import { MAX_COMENTARIO } from '../utils/reputacion.js';
import { campos } from './helpers.js';

/** `POST /reservas/:id/calificacion`: puntaje entero 1-5 y comentario opcional (solo espacios = sin comentario). */
export function validarCalificacion(body) {
  const comentario = typeof body.comentario === 'string' && body.comentario.trim() === '' ? null : body.comentario;
  const { valores, errores } = campos(body)
    .entero('puntaje', body.puntaje, { min: 1, max: 5 })
    .texto('comentario', comentario, { requerido: false, max: MAX_COMENTARIO })
    .resultado();
  valores.comentario ??= null;
  return { valores, errores };
}

/** `limit` y `offset` de los listados de calificaciones recibidas. */
export function validarPaginado(query) {
  return campos(query)
    .entero('limit', query.limit, { requerido: false, min: 1, max: 50, default: 20 })
    .entero('offset', query.offset, { requerido: false, min: 0, default: 0 })
    .resultado();
}
