// Rutas de los abonos de un estacionamiento: los planes que ofrece el propietario
// (uno activo por turno) y los abonos vendidos. Se montan en
// /api/estacionamientos/:id (ver estacionamiento.routes.js).
import { Router } from 'express';

import * as abonoController from '../../controllers/abono.controller.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { ROLES } from '../../utils/roles.js';
import { validarCambiosPlanAbono, validarPlanAbono } from '../../validators/abono.validator.js';

// mergeParams: para leer el :id del estacionamiento, que esta en la ruta padre.
const router = Router({ mergeParams: true });

const soloPropietario = [authenticate, requireRole(ROLES.PROPIETARIO)];

router.get('/planes-abono', abonoController.listarPlanes);

router.post('/planes-abono', ...soloPropietario, validate(validarPlanAbono), abonoController.crearPlan);

router.patch(
  '/planes-abono/:idPlan',
  ...soloPropietario,
  validate(validarCambiosPlanAbono),
  abonoController.actualizarPlan,
);

router.delete('/planes-abono/:idPlan', ...soloPropietario, abonoController.darDeBajaPlan);

router.get('/abonos', ...soloPropietario, abonoController.listarVendidos);

export default router;
