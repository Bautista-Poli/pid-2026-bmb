import * as adminService from '../services/admin.service.js';
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
  const estacionamiento = await adminService.aprobar(req.params.id, req.usuario.id);
  res.json({ estacionamiento });
});

export const rechazar = asyncHandler(async (req, res) => {
  const estacionamiento = await adminService.rechazar(req.params.id, req.usuario.id, req.body.motivo);
  res.json({ estacionamiento });
});
