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
