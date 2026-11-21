// Rutas de /api/admin. Todas exigen sesion y el perfil ADMINISTRADOR (router.use).
import { Router } from 'express';

import * as adminController from '../controllers/admin.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import {
  validarAprobacion,
  validarFiltroAdmin,
  validarFiltroResenas,
  validarRechazo,
} from '../validators/admin.validator.js';
import { validarPeriodo } from '../validators/estadistica.validator.js';

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

// Moderacion de reseñas denunciadas: desestimar u ocultar.
router.get('/resenas', validate(validarFiltroResenas, 'query'), adminController.listarResenas);
router.patch('/resenas/:id/desestimar', adminController.desestimarResena);
router.patch('/resenas/:id/ocultar', adminController.ocultarResena);

// Dashboard: lo que hay para revisar, conflictos y actividad de la plataforma.
router.get('/estadisticas', validate(validarPeriodo, 'query'), adminController.estadisticas);

export default router;
