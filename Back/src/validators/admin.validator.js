// Validadores de las rutas del administrador (filtros, aprobar, rechazar, moderar).
import { ESTADOS_DENUNCIA } from '../utils/denuncias.js';
import { ESTADOS_APROBACION } from '../utils/roles.js';
import { campos } from './helpers.js';

const ESTADOS = Object.values(ESTADOS_APROBACION);

/** `GET /admin/estacionamientos?estado=`: sin estado, la cola de pendientes. */
export function validarFiltroAdmin(query) {
  const resultado = campos(query)
    .enumerado('estado', query.estado, ESTADOS, { requerido: false })
    .resultado();
  resultado.valores.estado ??= ESTADOS_APROBACION.PENDIENTE;
  return resultado;
}

/** La version que el admin tenia en pantalla (obligatoria): ver admin.service.js: decidir. */
function conVersionVista(validador, body) {
  const resultado = validador.texto('enviado_en', body.enviado_en, { max: 40 }).resultado();
  const { enviado_en } = resultado.valores;
  if (enviado_en !== undefined && Number.isNaN(Date.parse(enviado_en))) {
    resultado.errores.push({ campo: 'enviado_en', mensaje: 'tiene que ser una fecha' });
  }
  return resultado;
}

/** Aprobar: la version que vio el admin (enviado_en). */
export function validarAprobacion(body) {
  return conVersionVista(campos(body), body);
}

/** Rechazar: motivo obligatorio y la version que vio el admin. */
export function validarRechazo(body) {
  return conVersionVista(campos(body).texto('motivo', body.motivo, { min: 10, max: 300 }), body);
}

/** `GET /admin/resenas?estado=`: por defecto, las denuncias pendientes. */
export function validarFiltroResenas(query) {
  const resultado = campos(query)
    .enumerado('estado', query.estado, Object.values(ESTADOS_DENUNCIA), { requerido: false })
    .resultado();
  resultado.valores.estado ??= ESTADOS_DENUNCIA.PENDIENTE;
  return resultado;
}
