// Validadores de abonos (planes y compra). Los usa validate() en las rutas.
import { NOMBRES_TURNO } from '../utils/turnos.js';
import { campos } from './helpers.js';

const OPCIONES_CUPOS = { min: 1, max: 100 };
const OPCIONES_PRECIO = { min: 0, max: 99_999_999 };

/** Alta de un plan: turno, cupos y precio. */
export function validarPlanAbono(body) {
  return campos(body)
    .enumerado('turno', body.turno, NOMBRES_TURNO)
    .entero('cupos', body.cupos, OPCIONES_CUPOS)
    .numero('precio', body.precio, OPCIONES_PRECIO)
    .resultado();
}

/** PATCH: el turno no se cambia (para eso se da de baja y se crea otro). */
export function validarCambiosPlanAbono(body) {
  const { valores, errores } = campos(body)
    .entero('cupos', body.cupos, { ...OPCIONES_CUPOS, requerido: false })
    .numero('precio', body.precio, { ...OPCIONES_PRECIO, requerido: false })
    .resultado();
  if (errores.length === 0 && valores.cupos === undefined && valores.precio === undefined) {
    errores.push({ campo: 'cupos', mensaje: 'enviar cupos y/o precio' });
  }
  return { valores, errores };
}

/** Compra: el id del plan. */
export function validarCompraAbono(body) {
  return campos(body).uuid('id_plan', body.id_plan).resultado();
}
