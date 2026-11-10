// Controllers de /api/estacionamientos: busqueda, detalle y ABM del estacionamiento,
// sus cocheras, disponibilidad, reservas recibidas y reputacion.
import * as estacionamientoService from '../services/estacionamiento.service.js';
import * as cocheraService from '../services/cochera.service.js';
import * as reputacionService from '../services/reputacion.service.js';
import * as reservaService from '../services/reserva.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../utils/roles.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** POST /api/estacionamientos (propietario) */
export const crear = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.crear(req.usuario.id, req.body);
  res.status(201).json({ estacionamiento });
});

/** GET /api/estacionamientos (publico) */
export const buscar = asyncHandler(async (req, res) => {
  const estacionamientos = await estacionamientoService.buscar(req.query);
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
  const estacionamiento = await estacionamientoService.darDeBaja(req.params.id, req.usuario.id);
  res.json({ estacionamiento });
});

/** POST /api/estacionamientos/:id/cocheras (propietario) */
export const crearCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.crear(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ cochera });
});

/** POST /api/estacionamientos/:id/cocheras/lote (propietario) */
export const crearLoteCocheras = asyncHandler(async (req, res) => {
  const cocheras = await cocheraService.crearLote(req.params.id, req.usuario.id, req.body.lotes);
  res.status(201).json({ cocheras });
});

/** GET /api/estacionamientos/:id/cocheras (publico) */
export const listarCocheras =asyncHandler(async (req, res) => {
  const cocheras = await cocheraService.listarPorEstacionamiento(req.params.id);
  res.json({ cocheras });
});

/** PATCH /api/estacionamientos/:id/cocheras/:idCochera (propietario) */
export const actualizarCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.actualizar(
    req.params.id,
    req.usuario.id,
    req.params.idCochera,
    req.body,
  );
  res.json({ cochera });
});

/** DELETE /api/estacionamientos/:id/cocheras/:idCochera (propietario) */
export const darDeBajaCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.darDeBaja(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
});

/** POST /api/estacionamientos/:id/cocheras/:idCochera/reactivar (propietario) */
export const reactivarCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.reactivar(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
});

/** DELETE /api/estacionamientos/:id/cocheras/:idCochera/definitiva (propietario) */
export const eliminarCochera = asyncHandler(async (req, res) => {
  await cocheraService.eliminar(req.params.id, req.usuario.id, req.params.idCochera);
  res.status(204).end();
});

/** POST /api/estacionamientos/:id/cocheras/:idCochera/bloquear (propietario) */
export const bloquearCochera = asyncHandler(async (req, res) => {
  const resultado = await cocheraService.bloquear(
    req.params.id,
    req.usuario.id,
    req.params.idCochera,
    req.body,
  );
  res.json(resultado);
});

/** POST /api/estacionamientos/:id/cocheras/:idCochera/desbloquear (propietario) */
export const desbloquearCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.desbloquear(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
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
