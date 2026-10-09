import { MODALIDADES, motivoDuracionInvalida } from '../utils/tarifas.js';
import { campos } from './helpers.js';

const vino = (valor) => valor !== undefined && valor !== null && valor !== '';

/**
 * La reserva se pide por estacionamiento (el backend asigna la cochera), por
 * una cochera puntual o con un abono (el estacionamiento sale del abono).
 * Sin abono tiene que venir exactamente uno de id_estacionamiento o id_cochera;
 * con abono no se manda modalidad (no se cobra).
 */
export function validarReserva(body) {
  const conAbono = vino(body.id_abono);
  const validador = campos(body)
    .uuid('id_abono', body.id_abono, { requerido: false })
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
      conAbono || vino(body.id_estacionamiento) !== vino(body.id_cochera),
      'id_estacionamiento',
      'enviar id_estacionamiento o id_cochera (uno solo)',
    )
    .verificar(!conAbono || !vino(body.modalidad), 'modalidad', 'con id_abono no se envia modalidad');

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

/** `POST /reservas/acceso`: el formato fino del codigo lo valida el servicio (404 si no existe). */
export function validarAcceso(body) {
  return campos(body).texto('codigo', body.codigo, { max: 20 }).resultado();
}
