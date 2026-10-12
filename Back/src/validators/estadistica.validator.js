import { campos } from './helpers.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAXIMO_DIAS = 92;

/** GET /api/estadisticas/propietario?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&id_estacionamiento=] */
export function validarPeriodo(query) {
  const resultado = campos(query)
    .texto('desde', query.desde, { min: 10, max: 10 })
    .texto('hasta', query.hasta, { min: 10, max: 10 })
    .uuid('id_estacionamiento', query.id_estacionamiento, { requerido: false })
    .resultado();
  const { valores, errores } = resultado;
  if (errores.length > 0) return resultado;

  const valida = (fecha) => FECHA.test(fecha) && !Number.isNaN(Date.parse(fecha));
  if (!valida(valores.desde)) errores.push({ campo: 'desde', mensaje: 'tiene que ser una fecha YYYY-MM-DD' });
  if (!valida(valores.hasta)) errores.push({ campo: 'hasta', mensaje: 'tiene que ser una fecha YYYY-MM-DD' });
  if (errores.length > 0) return resultado;

  const dias = (Date.parse(valores.hasta) - Date.parse(valores.desde)) / 86_400_000 + 1;
  if (dias < 1) errores.push({ campo: 'hasta', mensaje: 'no puede ser anterior a desde' });
  if (dias > MAXIMO_DIAS) errores.push({ campo: 'hasta', mensaje: `el periodo no puede pasar los ${MAXIMO_DIAS} dias` });
  return resultado;
}
