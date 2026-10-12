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

/** La version que el admin tenia en pantalla (opcional): ver admin.service.js: decidir. */
function conVersionVista(validador, body) {
  const resultado = validador.texto('enviado_en', body.enviado_en, { requerido: false, max: 40 }).resultado();
  const { enviado_en } = resultado.valores;
  if (enviado_en !== undefined && Number.isNaN(Date.parse(enviado_en))) {
    resultado.errores.push({ campo: 'enviado_en', mensaje: 'tiene que ser una fecha' });
  }
  return resultado;
}

export function validarAprobacion(body) {
  return conVersionVista(campos(body), body);
}

export function validarRechazo(body) {
  return conVersionVista(campos(body).texto('motivo', body.motivo, { min: 10, max: 300 }), body);
}
