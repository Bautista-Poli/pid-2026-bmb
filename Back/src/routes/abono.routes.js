// Rutas de /api/abonos (conductor): comprar, listar los propios y cancelar.
// Los planes de cada estacionamiento estan en estacionamiento/estacionamiento-abono.routes.
import { Router } from 'express';

import * as abonoController from '../controllers/abono.controller.js';
import { soloConductor } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validarCompraAbono } from '../validators/abono.validator.js';

const router = Router();


router.post('/', ...soloConductor, validate(validarCompraAbono), abonoController.comprar);
router.get('/', ...soloConductor, abonoController.listarMios);
router.patch('/:id/cancelar', ...soloConductor, abonoController.cancelar);

export default router;
