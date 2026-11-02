import * as calificacionService from '../services/calificacion.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const calificar = asyncHandler(async (req, res) => {
  const calificacion = await calificacionService.calificar(req.params.id, req.usuario, req.body);
  res.status(201).json({ calificacion });
});
