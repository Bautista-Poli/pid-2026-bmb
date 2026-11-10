// Controllers de abonos: leen el pedido (params, body, req.usuario), llaman a
// abono.service y responden JSON. Las rutas estan en abono.routes y estacionamiento/estacionamiento-abono.routes.
import * as abonoService from '../services/abono.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** GET /api/estacionamientos/:id/planes-abono (publico) */
export const listarPlanes = asyncHandler(async (req, res) => {
  res.json({ planes: await abonoService.listarPlanes(req.params.id) });
});

/** POST /api/estacionamientos/:id/planes-abono (propietario) */
export const crearPlan = asyncHandler(async (req, res) => {
  const plan = await abonoService.crearPlan(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ plan });
});

/** PATCH /api/estacionamientos/:id/planes-abono/:idPlan (propietario) */
export const actualizarPlan = asyncHandler(async (req, res) => {
  const plan = await abonoService.actualizarPlan(req.params.id, req.usuario.id, req.params.idPlan, req.body);
  res.json({ plan });
});

/** DELETE /api/estacionamientos/:id/planes-abono/:idPlan (propietario) */
export const darDeBajaPlan = asyncHandler(async (req, res) => {
  await abonoService.darDeBajaPlan(req.params.id, req.usuario.id, req.params.idPlan);
  res.status(204).end();
});

/** POST /api/abonos (conductor) */
export const comprar = asyncHandler(async (req, res) => {
  const abono = await abonoService.comprar(req.usuario.id, req.body);
  res.status(201).json({ abono });
});

/** GET /api/abonos (conductor) */
export const listarMios = asyncHandler(async (req, res) => {
  res.json({ abonos: await abonoService.listarPorConductor(req.usuario.id) });
});

/** PATCH /api/abonos/:id/cancelar (conductor) */
export const cancelar = asyncHandler(async (req, res) => {
  res.json({ abono: await abonoService.cancelar(req.params.id, req.usuario.id) });
});

/** GET /api/estacionamientos/:id/abonos (propietario) */
export const listarVendidos = asyncHandler(async (req, res) => {
  res.json({ abonos: await abonoService.listarPorEstacionamiento(req.params.id, req.usuario.id) });
});
