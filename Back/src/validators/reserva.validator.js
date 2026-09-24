import { MODALIDADES, motivoDuracionInvalida } from '../utils/tarifas.js';
import { campos } from './helpers.js';

const vino = (valor) => valor !== undefined && valor !== null && valor !== '';

/**
 * La reserva se pide por estacionamiento (el backend asigna la cochera) o por
 * una cochera puntual. Tiene que venir exactamente uno de los dos.
 */
export function validarReserva(body) {
  const validador = campos(body)
    .uuid('id_estacionamiento', body.id_estacionamiento, { requerido: false })
    .uuid('id_cochera', body.id_cochera, { requerido: false })
    .uuid('id_vehiculo', body.id_vehiculo)
    .enumerado('modalidad', body.modalidad, Object.values(MODALIDADES), {
      requerido: false,
      default: MODALIDADES.HORA,
    })
    .fechaHora('inicio', body.inicio)
    .fechaHora('fin', body.fin)
    .verificar(
      vino(body.id_estacionamiento) !== vino(body.id_cochera),
      'id_estacionamiento',
      'enviar id_estacionamiento o id_cochera (uno solo)',
    );

  const { valores, errores } = validador.resultado();

  if (valores.inicio && valores.fin) {
    if (valores.fin <= valores.inicio) {
      errores.push({ campo: 'fin', mensaje: 'debe ser posterior a inicio' });
    }
    if (valores.inicio.getTime() < Date.now() - 60_000) {
      errores.push({ campo: 'inicio', mensaje: 'no puede estar en el pasado' });
    }
    const motivoDuracion = motivoDuracionInvalida(valores.modalidad, valores.inicio, valores.fin);
    if (motivoDuracion) errores.push({ campo: 'fin', mensaje: motivoDuracion });
  }

  return { valores, errores };
}
