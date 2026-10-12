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

export function validarRechazo(body) {
  return campos(body).texto('motivo', body.motivo, { min: 10, max: 300 }).resultado();
}
