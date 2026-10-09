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
