import { campos } from './helpers.js';

const MAX_TEXTO = 1000;

/** `POST /incidencias/:id/mensajes` */
export function validarMensaje(body) {
  return campos(body)
    .texto('texto', body.texto, { max: MAX_TEXTO })
    .enumerado('canal', body.canal, ['GENERAL', 'PROPIETARIO', 'CONDUCTOR'], {
      requerido: false,
      default: 'GENERAL',
    })
    .resultado();
}

/** `PATCH /incidencias/:id/denunciar`: el motivo es obligatorio, para que el administrador sepa que paso. */
export function validarDenuncia(body) {
  return campos(body).texto('motivo', body.motivo, { min: 5, max: MAX_TEXTO }).resultado();
}

/** `PATCH /incidencias/:id/resolver`: comentario opcional. */
export function validarResolucion(body) {
  return campos(body).texto('comentario', body.comentario, { max: MAX_TEXTO, requerido: false }).resultado();
}

const MOTIVOS = ['NO_HABIA_LUGAR', 'COBRO_INCORRECTO', 'DANO_AL_VEHICULO', 'MAL_SERVICIO', 'OTRO'];

/** `POST /incidencias/reclamos`: sobre una reserva o un abono (uno de los dos). */
export function validarReclamo(body) {
  const unoSolo = Boolean(body.id_reserva) !== Boolean(body.id_abono);
  return campos(body)
    .verificar(unoSolo, 'id_reserva', 'indica la reserva o el abono (uno de los dos)')
    .uuid('id_reserva', body.id_reserva, { requerido: false })
    .uuid('id_abono', body.id_abono, { requerido: false })
    .enumerado('motivo', body.motivo, MOTIVOS)
    .numero('monto_pedido', body.monto_pedido, { min: 0, requerido: false })
    .texto('texto', body.texto, { min: 20, max: MAX_TEXTO })
    .resultado();
}
