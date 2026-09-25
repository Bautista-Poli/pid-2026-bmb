import { Router } from 'express';

import * as estacionamientoController from '../controllers/estacionamiento.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import {
  validarActualizacionCochera,
  validarBusqueda,
  validarCambiosEstacionamiento,
  validarCochera,
  validarDisponibilidad,
  validarEstacionamiento,
  validarFiltroReservas,
  validarLoteCocheras,
} from '../validators/estacionamiento.validator.js';

const router = Router();

const soloPropietario = [authenticate, requireRole(ROLES.PROPIETARIO)];

// Publico: busqueda y detalle de estacionamientos publicados.
router.get('/', validate(validarBusqueda, 'query'), estacionamientoController.buscar);

// Propietario: sus estacionamientos. Va antes de '/:id' para que no lo capture.
router.get('/mios', ...soloPropietario, estacionamientoController.listarMios);

router.get('/:id', estacionamientoController.obtener);
router.get('/:id/cocheras', estacionamientoController.listarCocheras);
router.get(
  '/:id/disponibilidad',
  validate(validarDisponibilidad, 'query'),
  estacionamientoController.disponibilidad,
);

// Propietario: reservas recibidas y ABM de estacionamientos y cocheras.
router.get(
  '/:id/reservas',
  ...soloPropietario,
  validate(validarFiltroReservas, 'query'),
  estacionamientoController.listarReservas,
);

router.post(
  '/',
  ...soloPropietario,
  validate(validarEstacionamiento),
  estacionamientoController.crear,
);

router.patch(
  '/:id',
  ...soloPropietario,
  validate(validarCambiosEstacionamiento),
  estacionamientoController.actualizar,
);

router.delete('/:id', ...soloPropietario, estacionamientoController.darDeBaja);

router.post(
  '/:id/cocheras',
  ...soloPropietario,
  validate(validarCochera),
  estacionamientoController.crearCochera,
);

router.post(
  '/:id/cocheras/lote',
  ...soloPropietario,
  validate(validarLoteCocheras),
  estacionamientoController.crearLoteCocheras,
);

router.patch(
  '/:id/cocheras/:idCochera',
  ...soloPropietario,
  validate(validarActualizacionCochera),
  estacionamientoController.actualizarCochera,
);

router.delete(
  '/:id/cocheras/:idCochera',
  ...soloPropietario,
  estacionamientoController.darDeBajaCochera,
);

export default router;
