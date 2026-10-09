import { NOMBRES_TURNO } from '../utils/turnos.js';
import { campos } from './helpers.js';

const OPCIONES_CUPOS = { min: 1, max: 100 };
const OPCIONES_PRECIO = { min: 0, max: 99_999_999 };

export function validarPlanAbono(body) {
  return campos(body)
    .enumerado('turno', body.turno, NOMBRES_TURNO)
    .entero('cupos', body.cupos, OPCIONES_CUPOS)
    .numero('precio', body.precio, OPCIONES_PRECIO)
    .resultado();
}

/** PATCH: el turno no se cambia (para eso se da de baja y se crea otro). */
export function validarCambiosPlanAbono(body) {
  return campos(body)
    .entero('cupos', body.cupos, { ...OPCIONES_CUPOS, requerido: false })
    .numero('precio', body.precio, { ...OPCIONES_PRECIO, requerido: false })
    .verificar(body.cupos !== undefined || body.precio !== undefined, 'cupos', 'enviar cupos y/o precio')
    .resultado();
}

export function validarCompraAbono(body) {
  return campos(body).uuid('id_plan', body.id_plan).resultado();
}
