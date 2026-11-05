// Controller del dashboard de estadisticas del propietario.
import * as estadisticaService from '../services/estadistica.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** GET /api/estadisticas/propietario (propietario) */
export const delPropietario = asyncHandler(async (req, res) => {
  const estadisticas = await estadisticaService.delPropietario(req.usuario.id, req.query);
  res.json(estadisticas);
});
