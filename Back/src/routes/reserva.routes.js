import { Router } from 'express';

import * as calificacionController from '../controllers/calificacion.controller.js';
import * as reservaController from '../controllers/reserva.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarCalificacion } from '../validators/calificacion.validator.js';
import { validarAcceso, validarReserva } from '../validators/reserva.validator.js';

const router = Router();

const soloConductor = [authenticate, requireRole(ROLES.CONDUCTOR)];
const soloPropietario = [authenticate, requireRole(ROLES.PROPIETARIO)];

router.post('/', ...soloConductor, validate(validarReserva), reservaController.crear);

router.get('/', ...soloConductor, reservaController.listarMias);

router.patch('/:id/cancelar', ...soloConductor, reservaController.cancelar);

// El ciclo lo maneja el propietario de la cochera. El ingreso y el egreso
// solo se registran con el codigo de la reserva (ver /acceso, abajo).
router.patch('/:id/confirmar', ...soloPropietario, reservaController.confirmar);
// No-show a mano, si el conductor avisó que no viene (el automatico lo hace la revision de vencimientos).
router.patch('/:id/ausente', ...soloPropietario, reservaController.marcarAusente);

// El operador escanea (o tipea) el QR de la reserva al entrar y al salir.
router.get('/acceso/:codigo', ...soloPropietario, reservaController.previaAcceso);
router.post('/acceso', ...soloPropietario, validate(validarAcceso), reservaController.registrarAcceso);

// Al terminar la reserva, cada parte califica a la otra (el perfil activo dice quien es).
router.post(
  '/:id/calificacion',
  authenticate,
  requireRole(ROLES.CONDUCTOR, ROLES.PROPIETARIO),
  validate(validarCalificacion),
  calificacionController.calificar,
);

export default router;
