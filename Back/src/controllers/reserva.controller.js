// Controllers de /api/reservas: crear, listar, cancelar, el ciclo del propietario
// (confirmar, ausente, acceso por codigo) y las calificaciones de los dos lados.
import * as calificacionService from '../services/calificacion.service.js';
import * as reputacionConductorService from '../services/reputacion/reputacion-conductor.service.js';
import * as reservaService from '../services/reserva/reserva.service.js';
import * as cicloService from '../services/reserva/reserva-ciclo.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** POST /api/reservas (conductor) */
export const crear = asyncHandler(async (req, res) => {
  const reserva = await reservaService.crear(req.usuario.id, req.body);
  res.status(201).json({ reserva });
});

/** GET /api/reservas (conductor) */
export const listarMias = asyncHandler(async (req, res) => {
  const reservas = await reservaService.listarPorConductor(req.usuario.id);
  res.json({ reservas });
});

/** PATCH /api/reservas/:id/cancelar (conductor) */
export const cancelar = asyncHandler(async (req, res) => {
  const reserva = await reservaService.cancelar(req.params.id, req.usuario.id);
  res.json({ reserva });
});

/** PATCH /api/reservas/:id/confirmar (propietario) */
export const confirmar = asyncHandler(async (req, res) => {
  const reserva = await cicloService.confirmar(req.params.id, req.usuario.id);
  res.json({ reserva });
});

/** PATCH /api/reservas/:id/ausente (propietario) */
export const marcarAusente = asyncHandler(async (req, res) => {
  const reserva = await cicloService.marcarAusente(req.params.id, req.usuario.id);
  res.json({ reserva });
});

/** GET /api/reservas/acceso/:codigo (propietario) */
export const previaAcceso = asyncHandler(async (req, res) => {
  res.json(await cicloService.previaAcceso(req.usuario.id, req.params.codigo));
});

/** POST /api/reservas/acceso (propietario) */
export const registrarAcceso = asyncHandler(async (req, res) => {
  res.json(await cicloService.registrarAcceso(req.usuario.id, req.body));
});

/** POST /api/reservas/:id/calificacion (conductor) */
export const calificar = asyncHandler(async (req, res) => {
  const calificacion = await calificacionService.crear(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ calificacion });
});


/** PATCH /api/reservas/:id/extender (propietario) */
export const extender = asyncHandler(async (req, res) => {
  //const result = await extenderReserva.extenderReserva(req.body.precio_adicionado, req.body.fecha_adicionada , req.body.precio_total_adicionado, req.params.id);
  const result = await extenderReserva.extenderReserva();
  res.status(201).json(result);
});

/** GET /api/reservas/mi-reputacion (conductor) */
export const miReputacion = asyncHandler(async (req, res) => {
  res.json({ reputacion: await reputacionConductorService.reputacionDelConductor(req.usuario.id) });
});

/** POST /api/reservas/:id/calificacion-conductor (propietario) */
export const calificarConductor = asyncHandler(async (req, res) => {
  const calificacion = await calificacionService.crearDelPropietario(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ calificacion });
});
