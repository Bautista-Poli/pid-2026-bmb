// Rutas de las cocheras de un estacionamiento. Se montan en
// /api/estacionamientos/:id/cocheras (ver estacionamiento.routes.js).
import { Router } from 'express';

import * as cocheraController from '../../controllers/estacionamiento/estacionamiento-cochera.controller.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { ROLES } from '../../utils/roles.js';
import {
  validarActualizacionCochera,
  validarBloqueoCochera,
  validarCochera,
  validarLoteCocheras,
} from '../../validators/estacionamiento.validator.js';

// mergeParams: para leer el :id del estacionamiento, que esta en la ruta padre.
const router = Router({ mergeParams: true });

const soloPropietario = [authenticate, requireRole(ROLES.PROPIETARIO)];

// Publico: las cocheras de un estacionamiento.
router.get('/', cocheraController.listarCocheras);

router.post('/', ...soloPropietario, validate(validarCochera), cocheraController.crearCochera);

router.post(
  '/lote',
  ...soloPropietario,
  validate(validarLoteCocheras),
  cocheraController.crearLoteCocheras,
);

router.patch(
  '/:idCochera',
  ...soloPropietario,
  validate(validarActualizacionCochera),
  cocheraController.actualizarCochera,
);

router.delete('/:idCochera', ...soloPropietario, cocheraController.darDeBajaCochera);

router.post('/:idCochera/reactivar', ...soloPropietario, cocheraController.reactivarCochera);

router.delete('/:idCochera/definitiva', ...soloPropietario, cocheraController.eliminarCochera);

router.post(
  '/:idCochera/bloquear',
  ...soloPropietario,
  validate(validarBloqueoCochera),
  cocheraController.bloquearCochera,
);

router.post('/:idCochera/desbloquear', ...soloPropietario, cocheraController.desbloquearCochera);

export default router;
