// Controllers de /api/vehiculos: el ABM de los vehiculos del conductor.
import * as vehiculoService from '../services/vehiculo.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** POST /api/vehiculos (conductor) */
export const crear = asyncHandler(async (req, res) => {
  const vehiculo = await vehiculoService.crear(req.usuario.id, req.body);
  res.status(201).json({ vehiculo });
});

/** GET /api/vehiculos (conductor) */
export const listarMios = asyncHandler(async (req, res) => {
  const vehiculos = await vehiculoService.listarPorConductor(req.usuario.id);
  res.json({ vehiculos });
});

/** PATCH /api/vehiculos/:id (conductor) */
export const actualizar = asyncHandler(async (req, res) => {
  const vehiculo = await vehiculoService.actualizar(req.params.id, req.usuario.id, req.body);
  res.json({ vehiculo });
});

/** DELETE /api/vehiculos/:id (conductor) */
export const eliminar = asyncHandler(async (req, res) => {
  const vehiculo = await vehiculoService.darDeBaja(req.params.id, req.usuario.id);
  res.json({ vehiculo });
});

/** GET /api/vehiculos/tipos (publico) */
export const listarTipos = asyncHandler(async (_req, res) => {
  const tipos = await vehiculoService.listarTipos();
  res.json({ tipos });
});
