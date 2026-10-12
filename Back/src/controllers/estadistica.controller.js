import * as estadisticaService from '../services/estadistica.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const delPropietario = asyncHandler(async (req, res) => {
  const estadisticas = await estadisticaService.delPropietario(req.usuario.id, req.query);
  res.json(estadisticas);
});
