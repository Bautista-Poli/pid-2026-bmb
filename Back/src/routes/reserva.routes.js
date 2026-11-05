// Rutas de /api/reservas: las del conductor (crear, cancelar, calificar) y las del
// propietario (confirmar, ausente, acceso por codigo, calificar al conductor).
import { Router } from 'express';

import * as reservaController from '../controllers/reserva.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarCalificacion, validarCalificacionConductor } from '../validators/calificacion.validator.js';
import { validarAcceso, validarReserva } from '../validators/reserva.validator.js';

const router = Router();

const soloConductor = [authenticate, requireRole(ROLES.CONDUCTOR)];
const soloPropietario = [authenticate, requireRole(ROLES.PROPIETARIO)];

router.post('/', ...soloConductor, validate(validarReserva), reservaController.crear);

router.get('/', ...soloConductor, reservaController.listarMias);

// Lo que le pusieron los propietarios (va antes de las rutas con /:id).
router.get('/mi-reputacion', ...soloConductor, reservaController.miReputacion);

router.patch('/:id/cancelar', ...soloConductor, reservaController.cancelar);

// Despues de entrar y salir, el conductor califica el estacionamiento (una vez).
router.post(
  '/:id/calificacion',
  ...soloConductor,
  validate(validarCalificacion),
  reservaController.calificar,
);

// Y el propietario califica al conductor de una reserva finalizada o ausente (una vez).
router.post(
  '/:id/calificacion-conductor',
  ...soloPropietario,
  validate(validarCalificacionConductor),
  reservaController.calificarConductor,
);

// El ciclo lo maneja el propietario de la cochera. El ingreso y el egreso
// solo se registran con el codigo de la reserva (ver /acceso, abajo).
router.patch('/:id/confirmar', ...soloPropietario, reservaController.confirmar);
// No-show a mano, si el conductor avisó que no viene (el automatico lo hace la revision de vencimientos).
router.patch('/:id/ausente', ...soloPropietario, reservaController.marcarAusente);

// El operador escanea (o tipea) el QR de la reserva al entrar y al salir.
router.get('/acceso/:codigo', ...soloPropietario, reservaController.previaAcceso);
router.post('/acceso', ...soloPropietario, validate(validarAcceso), reservaController.registrarAcceso);

export default router;
