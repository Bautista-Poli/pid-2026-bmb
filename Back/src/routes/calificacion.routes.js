import { Router } from 'express';

import * as calificacionController from '../controllers/calificacion.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarPaginado } from '../validators/calificacion.validator.js';

const router = Router();

// Lo que los propietarios le pusieron al conductor (calificar es POST /reservas/:id/calificacion).
router.get(
  '/recibidas',
  authenticate,
  requireRole(ROLES.CONDUCTOR),
  validate(validarPaginado, 'query'),
  calificacionController.recibidasComoConductor,
);

export default router;
