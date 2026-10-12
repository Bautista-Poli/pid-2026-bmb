import { Router } from 'express';

import * as adminController from '../controllers/admin.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarAprobacion, validarFiltroAdmin, validarRechazo } from '../validators/admin.validator.js';

const router = Router();

// Todo /admin es del Administrador de plataforma.
router.use(authenticate, requireRole(ROLES.ADMINISTRADOR));

router.get(
  '/estacionamientos',
  validate(validarFiltroAdmin, 'query'),
  adminController.listarEstacionamientos,
);
router.get('/estacionamientos/:id', adminController.obtenerEstacionamiento);
router.patch('/estacionamientos/:id/aprobar', validate(validarAprobacion), adminController.aprobar);
router.patch(
  '/estacionamientos/:id/rechazar',
  validate(validarRechazo),
  adminController.rechazar,
);

export default router;
