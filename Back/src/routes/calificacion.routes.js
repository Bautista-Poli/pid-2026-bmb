import { Router } from 'express';

import * as calificacionController from '../controllers/calificacion.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarDenunciaResena } from '../validators/denuncia-resena.validator.js';

const router = Router();

// La parte calificada denuncia una reseña (una vez); la modera el administrador.
router.post(
  '/:id/denuncia',
  authenticate,
  requireRole(ROLES.CONDUCTOR, ROLES.PROPIETARIO),
  validate(validarDenunciaResena),
  calificacionController.denunciar,
);

export default router;
