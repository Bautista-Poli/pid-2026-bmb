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

const ESTADOS_INCIDENCIA = ['ABIERTA', 'DENUNCIADA', 'RESUELTA', 'RETIRADA'];

/** `GET /admin/incidencias?estado=`: sin estado, la cola de denunciadas. */
export function validarFiltroIncidencias(query) {
  const resultado = campos(query)
    .enumerado('estado', query.estado, ESTADOS_INCIDENCIA, { requerido: false })
    .resultado();
  resultado.valores.estado ??= 'DENUNCIADA';
  return resultado;
}

/** `POST /admin/incidencias/:id/mensajes`: solo en los chats privados (el general es de las partes). */
export function validarMensajeModeracion(body) {
  return campos(body)
    .texto('texto', body.texto, { max: 1000 })
    .enumerado('canal', body.canal, ['PROPIETARIO', 'CONDUCTOR'])
    .resultado();
}

/** `PATCH /admin/incidencias/:id/resolver`: a favor del conductor, con monto; del propietario, sin. */
export function validarResolucionModeracion(body) {
  const resultado = campos(body)
    .enumerado('resolucion', body.resolucion, ['A_FAVOR_CONDUCTOR', 'A_FAVOR_PROPIETARIO'])
    .numero('monto', body.monto, { min: 0, requerido: false })
    .texto('fundamento', body.fundamento, { min: 20, max: 1000 })
    .resultado();
  const { resolucion, monto } = resultado.valores;
  if (resolucion === 'A_FAVOR_CONDUCTOR' && !(monto > 0)) {
    resultado.errores.push({ campo: 'monto', mensaje: 'a favor del conductor, indica cuanto se le devuelve' });
  }
  if (resolucion === 'A_FAVOR_PROPIETARIO' && monto > 0) {
    resultado.errores.push({ campo: 'monto', mensaje: 'a favor del propietario no hay devolucion' });
  }
  return resultado;
}
