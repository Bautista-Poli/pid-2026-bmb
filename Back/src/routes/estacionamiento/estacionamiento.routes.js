// Rutas de /api/estacionamientos: lo publico (busqueda, detalle, disponibilidad)
// y lo del propietario (ABM, reservas recibidas, reputacion). Las cocheras y los
// abonos tienen su propio archivo y se montan aca.
import { Router } from 'express';

import * as estacionamientoController from '../../controllers/estacionamiento/estacionamiento.controller.js';
import { authenticate, authenticateOpcional, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { ROLES } from '../../utils/roles.js';
import { validarPeriodoReputacion } from '../../validators/calificacion.validator.js';
import {
  validarBusqueda,
  validarCambiosEstacionamiento,
  validarDisponibilidad,
  validarEstacionamiento,
  validarFiltroReservas,
} from '../../validators/estacionamiento.validator.js';
import abonoRoutes from './estacionamiento-abono.routes.js';
import cocheraRoutes from './estacionamiento-cochera.routes.js';

const router = Router();

const soloPropietario = [authenticate, requireRole(ROLES.PROPIETARIO)];

// Publico: busqueda de estacionamientos publicados.
router.get('/', validate(validarBusqueda, 'query'), estacionamientoController.buscar);

// Propietario: sus estacionamientos. Va antes de '/:id' para que no lo capture.
router.get('/mios', ...soloPropietario, estacionamientoController.listarMios);

// Con sesion opcional: el dueno ve el suyo aunque todavia no este aprobado.
router.get('/:id', authenticateOpcional, estacionamientoController.obtener);

router.get(
  '/:id/disponibilidad',
  validate(validarDisponibilidad, 'query'),
  estacionamientoController.disponibilidad,
);

// Propietario: su reputacion (calificaciones + operacion) en los ultimos 30 o 90 dias.
router.get(
  '/:id/reputacion',
  ...soloPropietario,
  validate(validarPeriodoReputacion, 'query'),
  estacionamientoController.reputacion,
);

// Propietario: reservas recibidas y ABM del estacionamiento.
router.get(
  '/:id/reservas',
  ...soloPropietario,
  validate(validarFiltroReservas, 'query'),
  estacionamientoController.listarReservas,
);

router.post('/', ...soloPropietario, validate(validarEstacionamiento), estacionamientoController.crear);

router.patch(
  '/:id',
  ...soloPropietario,
  validate(validarCambiosEstacionamiento),
  estacionamientoController.actualizar,
);

router.patch('/:id/reenviar-revision', ...soloPropietario, estacionamientoController.reenviarRevision);

router.delete('/:id', ...soloPropietario, estacionamientoController.darDeBaja);

// Sub-rutas con archivo propio.
router.use('/:id/cocheras', cocheraRoutes);
router.use('/:id', abonoRoutes);

export default router;
