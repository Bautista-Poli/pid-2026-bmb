import { Router } from 'express';

import * as abonoController from '../controllers/abono.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarCompraAbono } from '../validators/abono.validator.js';

const router = Router();

const soloConductor = [authenticate, requireRole(ROLES.CONDUCTOR)];

router.post('/', ...soloConductor, validate(validarCompraAbono), abonoController.comprar);
router.get('/', ...soloConductor, abonoController.listarMios);
router.patch('/:id/cancelar', ...soloConductor, abonoController.cancelar);

export default router;
