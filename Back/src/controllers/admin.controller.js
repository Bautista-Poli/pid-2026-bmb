import * as adminService from '../services/admin.service.js';
import * as moderacionService from '../services/moderacion.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listarEstacionamientos = asyncHandler(async (req, res) => {
  const estacionamientos = await adminService.listarEstacionamientos(req.query);
  res.json({ estacionamientos });
});

export const obtenerEstacionamiento = asyncHandler(async (req, res) => {
  const estacionamiento = await adminService.obtenerEstacionamiento(req.params.id);
  res.json({ estacionamiento });
});

export const aprobar = asyncHandler(async (req, res) => {
  const estacionamiento = await adminService.aprobar(req.params.id, req.usuario.id, req.body);
  res.json({ estacionamiento });
});

export const rechazar = asyncHandler(async (req, res) => {
  const estacionamiento = await adminService.rechazar(req.params.id, req.usuario.id, req.body);
  res.json({ estacionamiento });
});

export const listarIncidencias = asyncHandler(async (req, res) => {
  res.json({ incidencias: await moderacionService.listar(req.query) });
});

export const obtenerIncidencia = asyncHandler(async (req, res) => {
  res.json({ incidencia: await moderacionService.obtener(req.params.id) });
});

export const escribirEnIncidencia = asyncHandler(async (req, res) => {
  const incidencia = await moderacionService.escribir(req.usuario, req.params.id, req.body);
  res.status(201).json({ incidencia });
});

export const resolverIncidencia = asyncHandler(async (req, res) => {
  res.json({ incidencia: await moderacionService.resolver(req.usuario, req.params.id, req.body) });
});
