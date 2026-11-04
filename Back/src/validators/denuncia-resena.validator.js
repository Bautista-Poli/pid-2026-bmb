import { MOTIVOS_DENUNCIA } from '../utils/denuncias.js';
import { campos } from './helpers.js';

/** `POST /calificaciones/:id/denuncia`: motivo obligatorio y detalle opcional. */
export function validarDenunciaResena(body) {
  return campos(body)
    .enumerado('motivo', body.motivo, MOTIVOS_DENUNCIA)
    .texto('detalle', body.detalle, { max: 500, requerido: false })
    .resultado();
}
