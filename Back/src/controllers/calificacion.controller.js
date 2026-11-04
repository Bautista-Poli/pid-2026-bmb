import * as denunciaService from '../services/denuncia-resena.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const denunciar = asyncHandler(async (req, res) => {
  const calificacion = await denunciaService.denunciar(req.params.id, req.usuario, req.body);
  res.status(201).json({ calificacion });
});
