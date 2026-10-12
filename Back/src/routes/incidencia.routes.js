import { Router } from 'express';

import * as incidenciaController from '../controllers/incidencia.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import {
  validarAceptacion,
  validarDenuncia,
  validarMensaje,
  validarReclamo,
  validarResolucion,
} from '../validators/incidencia.validator.js';

const router = Router();

// Ven y escriben en el hilo el propietario del estacionamiento y el conductor
// de la reserva (el servicio filtra por participante segun el perfil activo).
const participante = [authenticate, requireRole(ROLES.PROPIETARIO, ROLES.CONDUCTOR)];
const soloPropietario = [authenticate, requireRole(ROLES.PROPIETARIO)];
const soloConductor = [authenticate, requireRole(ROLES.CONDUCTOR)];

// El conductor abre un reclamo sobre una reserva o un abono suyo.
router.post('/reclamos', ...soloConductor, validate(validarReclamo), incidenciaController.abrirReclamo);

router.get('/', ...participante, incidenciaController.listar);
router.get('/:id', ...participante, incidenciaController.obtener);
router.post('/:id/mensajes', ...participante, validate(validarMensaje), incidenciaController.responder);

// Darla por resuelta (mientras no este denunciada) es del propietario.
router.patch('/:id/resolver', ...soloPropietario, validate(validarResolucion), incidenciaController.resolver);
// Cualquiera de las dos partes la puede escalar a la moderacion.
router.patch('/:id/denunciar', ...participante, validate(validarDenuncia), incidenciaController.denunciar);

// Reclamos: el conductor acepta la propuesta del propietario o lo retira.
router.patch('/:id/aceptar', ...soloConductor, validate(validarAceptacion), incidenciaController.aceptar);
router.patch('/:id/retirar', ...soloConductor, incidenciaController.retirar);

export default router;
