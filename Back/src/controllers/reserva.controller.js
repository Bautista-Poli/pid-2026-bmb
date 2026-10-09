import * as reservaService from '../services/reserva.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const crear = asyncHandler(async (req, res) => {
  const reserva = await reservaService.crear(req.usuario.id, req.body);
  res.status(201).json({ reserva });
});

export const listarMias = asyncHandler(async (req, res) => {
  const reservas = await reservaService.listarPorConductor(req.usuario.id);
  res.json({ reservas });
});

export const cancelar = asyncHandler(async (req, res) => {
  const reserva = await reservaService.cancelar(req.params.id, req.usuario.id);
  res.json({ reserva });
});

export const confirmar = asyncHandler(async (req, res) => {
  const reserva = await reservaService.confirmar(req.params.id, req.usuario.id);
  res.json({ reserva });
});

export const registrarIngreso = asyncHandler(async (req, res) => {
  const reserva = await reservaService.registrarIngreso(req.params.id, req.usuario.id);
  res.json({ reserva });
});

export const registrarEgreso = asyncHandler(async (req, res) => {
  const reserva = await reservaService.registrarEgreso(req.params.id, req.usuario.id);
  res.json({ reserva });
});

export const previaAcceso = asyncHandler(async (req, res) => {
  res.json(await reservaService.previaAcceso(req.usuario.id, req.params.codigo));
});

export const registrarAcceso = asyncHandler(async (req, res) => {
  res.json(await reservaService.registrarAcceso(req.usuario.id, req.body));
});
