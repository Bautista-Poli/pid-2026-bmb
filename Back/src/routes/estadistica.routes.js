import { Router } from 'express';

import * as estadisticaController from '../controllers/estadistica.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarPeriodo } from '../validators/estadistica.validator.js';

const router = Router();

// Dashboard del propietario: ocupacion, ingresos, demanda y cancelaciones.
router.get(
  '/propietario',
  authenticate,
  requireRole(ROLES.PROPIETARIO),
  validate(validarPeriodo, 'query'),
  estadisticaController.delPropietario,
);

export default router;
