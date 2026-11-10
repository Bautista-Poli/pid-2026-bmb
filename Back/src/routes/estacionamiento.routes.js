// Rutas de /api/estacionamientos: lo publico (busqueda, detalle, disponibilidad)
// y lo del propietario (ABM, cocheras, planes de abono, reservas recibidas, reputacion).
import { Router } from 'express';

import * as abonoController from '../controllers/abono.controller.js';
import * as estacionamientoController from '../controllers/estacionamiento.controller.js';
import { authenticate, authenticateOpcional, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarCambiosPlanAbono, validarPlanAbono } from '../validators/abono.validator.js';
import { validarPeriodoReputacion } from '../validators/calificacion.validator.js';
import {
  validarActualizacionCochera,
  validarBloqueoCochera,
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

// Con sesion opcional: el dueno ve el suyo aunque todavia no este aprobado.
router.get('/:id', authenticateOpcional, estacionamientoController.obtener);
router.get('/:id/cocheras', estacionamientoController.listarCocheras);

router.get('/:id/cocheras', estacionamientoController.listarCocheras);

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

router.patch('/:id/reenviar-revision', ...soloPropietario, estacionamientoController.reenviarRevision);

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

router.post(
  '/:id/cocheras/:idCochera/reactivar',
  ...soloPropietario,
  estacionamientoController.reactivarCochera,
);

router.delete(
  '/:id/cocheras/:idCochera/definitiva',
  ...soloPropietario,
  estacionamientoController.eliminarCochera,
);

router.post(
  '/:id/cocheras/:idCochera/bloquear',
  ...soloPropietario,
  validate(validarBloqueoCochera),
  estacionamientoController.bloquearCochera,
);

router.post(
  '/:id/cocheras/:idCochera/desbloquear',
  ...soloPropietario,
  estacionamientoController.desbloquearCochera,
);

// Abonos: los planes que ofrece el propietario (uno activo por turno).
router.get('/:id/planes-abono', abonoController.listarPlanes);

router.post(
  '/:id/planes-abono',
  ...soloPropietario,
  validate(validarPlanAbono),
  abonoController.crearPlan,
);

router.patch(
  '/:id/planes-abono/:idPlan',
  ...soloPropietario,
  validate(validarCambiosPlanAbono),
  abonoController.actualizarPlan,
);

router.delete('/:id/planes-abono/:idPlan', ...soloPropietario, abonoController.darDeBajaPlan);

router.get('/:id/abonos', ...soloPropietario, abonoController.listarVendidos);

export default router;
