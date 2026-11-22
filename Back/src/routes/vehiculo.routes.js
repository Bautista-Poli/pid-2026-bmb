// Rutas de /api/vehiculos: el catalogo de tipos (publico) y el ABM del conductor.
import { Router } from 'express';

import * as vehiculoController from '../controllers/vehiculo.controller.js';
import { soloConductor } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validarCambiosVehiculo, validarVehiculo } from '../validators/vehiculo.validator.js';

const router = Router();

router.get('/tipos', vehiculoController.listarTipos);

router.post(
  '/',
  ...soloConductor,
  validate(validarVehiculo),
  vehiculoController.crear,
);

router.get('/', ...soloConductor, vehiculoController.listarMios);

router.patch(
  '/:id',
  ...soloConductor,
  validate(validarCambiosVehiculo),
  vehiculoController.actualizar,
);

router.delete('/:id', ...soloConductor, vehiculoController.eliminar);

export default router;
