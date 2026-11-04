import { CODIGOS_ETIQUETA } from '../services/reputacion.service.js';
import { campos } from './helpers.js';

const NOTA = { min: 1, max: 5 };

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

  const etiquetas = body.etiquetas ?? [];
  if (!Array.isArray(etiquetas)) {
    errores.push({ campo: 'etiquetas', mensaje: 'debe ser una lista' });
  } else {
    const limpias = [...new Set(etiquetas.map((e) => String(e).trim().toUpperCase()))];
    const invalidas = limpias.filter((e) => !CODIGOS_ETIQUETA.includes(e));
    if (invalidas.length > 0) {
      errores.push({ campo: 'etiquetas', mensaje: `debe tener solo: ${CODIGOS_ETIQUETA.join(', ')}` });
    } else {
      valores.etiquetas = limpias;
    }
  }

  return { valores, errores };
}

/** `GET /estacionamientos/:id/reputacion?dias=30|90` */
export function validarPeriodoReputacion(query) {
  return campos(query)
    .entero('dias', query.dias, { requerido: false, default: 30 })
    .verificar(query.dias === undefined || ['30', '90', 30, 90].includes(query.dias), 'dias', 'debe ser 30 o 90')
    .resultado();
}
