// Controllers de /api/incidencias: listado, detalle, chat, reclamos del conductor
// y su ciclo (resolver, denunciar, aceptar, retirar).
import * as incidenciaService from '../services/incidencia/incidencia.service.js';
import * as reclamoService from '../services/incidencia/incidencia-reclamo.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** GET /api/incidencias (conductor o propietario) */
export const listar = asyncHandler(async (req, res) => {
  res.json({ incidencias: await incidenciaService.listar(req.usuario) });
});

/** GET /api/incidencias/:id (conductor o propietario) */
export const obtener = asyncHandler(async (req, res) => {
  res.json({ incidencia: await incidenciaService.obtener(req.usuario, req.params.id) });
});

/** POST /api/incidencias/:id/mensajes (conductor o propietario) */
export const responder = asyncHandler(async (req, res) => {
  const incidencia = await incidenciaService.responder(req.usuario, req.params.id, req.body);
  res.status(201).json({ incidencia });
});

/** PATCH /api/incidencias/:id/resolver (propietario) */
export const resolver = asyncHandler(async (req, res) => {
  res.json({ incidencia: await incidenciaService.resolver(req.usuario, req.params.id, req.body) });
});

/** PATCH /api/incidencias/:id/denunciar (conductor o propietario) */
export const denunciar = asyncHandler(async (req, res) => {
  res.json({ incidencia: await incidenciaService.denunciar(req.usuario, req.params.id, req.body) });
});

/** POST /api/incidencias/reclamos (conductor) */
export const abrirReclamo = asyncHandler(async (req, res) => {
  res.status(201).json({ incidencia: await reclamoService.abrirReclamo(req.usuario, req.body) });
});

/** PATCH /api/incidencias/:id/aceptar (conductor) */
export const aceptar = asyncHandler(async (req, res) => {
  res.json({ incidencia: await reclamoService.aceptar(req.usuario, req.params.id, req.body) });
});

/** PATCH /api/incidencias/:id/retirar (conductor) */
export const retirar = asyncHandler(async (req, res) => {
  res.json({ incidencia: await reclamoService.retirar(req.usuario, req.params.id) });
});
