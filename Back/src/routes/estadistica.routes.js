// Rutas de /api/estadisticas: el dashboard del propietario.
import { Router } from 'express';

import * as estadisticaController from '../controllers/estadistica.controller.js';
import { soloPropietario } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validarPeriodo } from '../validators/estadistica.validator.js';

const router = Router();

// Dashboard del propietario: ocupacion, ingresos, demanda y cancelaciones.
router.get(
  '/propietario',
  ...soloPropietario,
  validate(validarPeriodo, 'query'),
  estadisticaController.delPropietario,
);

export default router;
