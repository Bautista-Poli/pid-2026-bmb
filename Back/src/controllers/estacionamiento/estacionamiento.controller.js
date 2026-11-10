// Controllers de /api/estacionamientos: busqueda, detalle y ABM del estacionamiento,
// disponibilidad, reservas recibidas y reputacion. Las cocheras estan en
// estacionamiento-cochera.controller.js.
import * as estacionamientoService from '../../services/estacionamiento/estacionamiento.service.js';
import * as busquedaService from '../../services/estacionamiento/estacionamiento-busqueda.service.js';
import * as bajaService from '../../services/estacionamiento/estacionamiento-baja.service.js';
import * as reputacionService from '../../services/reputacion.service.js';
import * as reservaService from '../../services/reserva.service.js';
import { ROLES } from '../../utils/roles.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

/** POST /api/estacionamientos (propietario) */
export const crear = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.crear(req.usuario.id, req.body);
  res.status(201).json({ estacionamiento });
});

/** GET /api/estacionamientos (publico) */
export const buscar = asyncHandler(async (req, res) => {
  const estacionamientos = await busquedaService.buscar(req.query);
  res.json({
    estacionamientos,
    paginacion: {
      limit: req.query.limit,
      offset: req.query.offset,
      cantidad: estacionamientos.length,
    },
  });
});

/** GET /api/estacionamientos/:id (publico, con sesion opcional) */
export const obtener = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.obtenerPorId(req.params.id, {
    idSolicitante: req.usuario?.id ?? null,
    esAdmin: req.usuario?.rol === ROLES.ADMINISTRADOR,
  });
  res.json({ estacionamiento });
});

/** GET /api/estacionamientos/mios (propietario) */
export const listarMios = asyncHandler(async (req, res) => {
  const estacionamientos = await estacionamientoService.listarPorPropietario(req.usuario.id);
  res.json({ estacionamientos });
});

/** PATCH /api/estacionamientos/:id (propietario) */
export const actualizar = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.actualizar(
    req.params.id,
    req.usuario.id,
    req.body,
  );
  res.json({ estacionamiento });
});

/** PATCH /api/estacionamientos/:id/reenviar-revision (propietario) */
export const reenviarRevision = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.reenviarRevision(req.params.id, req.usuario.id);
  res.json({ estacionamiento });
});

/** DELETE /api/estacionamientos/:id (propietario) */
export const darDeBaja = asyncHandler(async (req, res) => {
  const estacionamiento = await bajaService.darDeBaja(req.params.id, req.usuario.id);
  res.json({ estacionamiento });
});

/** GET /api/estacionamientos/:id/disponibilidad (publico) */
export const disponibilidad = asyncHandler(async (req, res) => {
  const resultado = await reservaService.disponibilidad(req.params.id, req.query);
  res.json(resultado);
});

/** GET /api/estacionamientos/:id/reservas (propietario) */
export const listarReservas = asyncHandler(async (req, res) => {
  const reservas = await reservaService.listarPorEstacionamiento(
    req.params.id,
    req.usuario.id,
    req.query,
  );
  res.json({ reservas });
});

/** GET /api/estacionamientos/:id/reputacion (propietario) */
export const reputacion = asyncHandler(async (req, res) => {
  res.json(await reputacionService.delEstacionamiento(req.params.id, req.usuario.id, req.query));
});
