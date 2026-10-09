import * as abonoService from '../services/abono.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listarPlanes = asyncHandler(async (req, res) => {
  res.json({ planes: await abonoService.listarPlanes(req.params.id) });
});

export const crearPlan = asyncHandler(async (req, res) => {
  const plan = await abonoService.crearPlan(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ plan });
});

export const actualizarPlan = asyncHandler(async (req, res) => {
  const plan = await abonoService.actualizarPlan(req.params.id, req.usuario.id, req.params.idPlan, req.body);
  res.json({ plan });
});

export const darDeBajaPlan = asyncHandler(async (req, res) => {
  await abonoService.darDeBajaPlan(req.params.id, req.usuario.id, req.params.idPlan);
  res.status(204).end();
});

export const comprar = asyncHandler(async (req, res) => {
  const abono = await abonoService.comprar(req.usuario.id, req.body);
  res.status(201).json({ abono });
});

export const listarMios = asyncHandler(async (req, res) => {
  res.json({ abonos: await abonoService.listarPorConductor(req.usuario.id) });
});

export const cancelar = asyncHandler(async (req, res) => {
  res.json({ abono: await abonoService.cancelar(req.params.id, req.usuario.id) });
});

export const listarVendidos = asyncHandler(async (req, res) => {
  res.json({ abonos: await abonoService.listarPorEstacionamiento(req.params.id, req.usuario.id) });
});
