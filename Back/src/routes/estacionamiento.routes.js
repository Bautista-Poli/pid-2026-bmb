import express, { Router } from 'express';

import * as estacionamientoController from '../controllers/estacionamiento.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
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

/**
 * La foto se sube como body crudo: el archivo tal cual, con su tipo en el
 * Content-Type. Va montado solo en esta ruta -- el express.json() global de
 * app.js no la toca porque solo parsea application/json.
 */
const imagen = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' });

// Publico: busqueda y detalle de estacionamientos publicados.
router.get('/', validate(validarBusqueda, 'query'), estacionamientoController.buscar);

// Propietario: sus estacionamientos. Va antes de '/:id' para que no lo capture.
router.get('/mios', ...soloPropietario, estacionamientoController.listarMios);

router.get('/:id', estacionamientoController.obtener);
router.get('/:id/cocheras', estacionamientoController.listarCocheras);
router.get('/:id/foto', estacionamientoController.obtenerFoto);
router.get('/:id/fotos/:idFoto', estacionamientoController.obtenerFotoDeGaleria);
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

router.put('/:id/foto', ...soloPropietario, imagen, estacionamientoController.guardarFoto);
router.delete('/:id/foto', ...soloPropietario, estacionamientoController.borrarFoto);

// Galeria: `/:id/foto` es la portada; estas suman y sacan el resto de las fotos.
router.post('/:id/fotos', ...soloPropietario, imagen, estacionamientoController.agregarFoto);
router.delete('/:id/fotos/:idFoto', ...soloPropietario, estacionamientoController.borrarFotoDeGaleria);

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

export default router;
