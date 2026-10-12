import { Router } from 'express';

import * as vehiculoController from '../controllers/vehiculo.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { LIMITE_FIRMAS, limitarPorUsuario } from '../middlewares/limite.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarCambiosVehiculo, validarVehiculo } from '../validators/vehiculo.validator.js';

const router = Router();

router.get('/tipos', vehiculoController.listarTipos);

router.post(
  '/',
  authenticate,
  requireRole(ROLES.CONDUCTOR),
  validate(validarVehiculo),
  vehiculoController.crear,
);

router.get('/', authenticate, requireRole(ROLES.CONDUCTOR), vehiculoController.listarMios);

router.patch(
  '/:id',
  authenticate,
  requireRole(ROLES.CONDUCTOR),
  validate(validarCambiosVehiculo),
  vehiculoController.actualizar,
);

router.delete('/:id', authenticate, requireRole(ROLES.CONDUCTOR), vehiculoController.eliminar);

// Foto propia del vehiculo: firma para subir a Cloudinary y despues su public_id.
const soloConductor = [authenticate, requireRole(ROLES.CONDUCTOR)];
router.post('/:id/foto/firma', ...soloConductor, limitarPorUsuario(LIMITE_FIRMAS), vehiculoController.firmarFoto);
router.put('/:id/foto', ...soloConductor, vehiculoController.guardarFoto);
router.delete('/:id/foto', ...soloConductor, vehiculoController.borrarFoto);

export default router;
