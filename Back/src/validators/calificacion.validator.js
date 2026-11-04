import { CODIGOS_ETIQUETA, CODIGOS_ETIQUETA_CONDUCTOR } from '../services/reputacion.service.js';
import { campos } from './helpers.js';

const NOTA = { min: 1, max: 5 };

/** Normaliza `etiquetas` (sin repetidos, en mayusculas) en `valores`, o suma el error. */
function validarEtiquetas(bruto, permitidas, valores, errores) {
  const etiquetas = bruto ?? [];
  if (!Array.isArray(etiquetas)) {
    errores.push({ campo: 'etiquetas', mensaje: 'debe ser una lista' });
    return;
  }
  const limpias = [...new Set(etiquetas.map((e) => String(e).trim().toUpperCase()))];
  if (limpias.some((e) => !permitidas.includes(e))) {
    errores.push({ campo: 'etiquetas', mensaje: `debe tener solo: ${permitidas.join(', ')}` });
    return;
  }
  valores.etiquetas = limpias;
}

/** `POST /reservas/:id/calificacion`: las cinco categorias de 1 a 5, etiquetas y comentario opcionales. */
export function validarCalificacion(body) {
  const { valores, errores } = campos(body)
    .entero('limpieza', body.limpieza, NOTA)
    .entero('infraestructura', body.infraestructura, NOTA)
    .entero('atencion', body.atencion, NOTA)
    .entero('seguridad', body.seguridad, NOTA)
    .entero('acceso', body.acceso, NOTA)
    .texto('comentario', body.comentario, { max: 500, requerido: false })
    .resultado();
  validarEtiquetas(body.etiquetas, CODIGOS_ETIQUETA, valores, errores);
  return { valores, errores };
}

/** `POST /reservas/:id/calificacion-conductor`: puntaje de 1 a 5, etiquetas y comentario opcionales. */
export function validarCalificacionConductor(body) {
  const { valores, errores } = campos(body)
    .entero('puntaje', body.puntaje, NOTA)
    .texto('comentario', body.comentario, { max: 500, requerido: false })
    .resultado();
  validarEtiquetas(body.etiquetas, CODIGOS_ETIQUETA_CONDUCTOR, valores, errores);
  return { valores, errores };
}

/** `GET /estacionamientos/:id/reputacion?dias=30|90` */
export function validarPeriodoReputacion(query) {
  return campos(query)
    .entero('dias', query.dias, { requerido: false, default: 30 })
    .verificar(query.dias === undefined || ['30', '90', 30, 90].includes(query.dias), 'dias', 'debe ser 30 o 90')
    .resultado();
}
