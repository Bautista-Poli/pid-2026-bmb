import * as calificacionService from '../services/calificacion.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const calificar = asyncHandler(async (req, res) => {
  const calificacion = await calificacionService.calificar(req.params.id, req.usuario, req.body);
  res.status(201).json({ calificacion });
});

export const recibidasComoConductor = asyncHandler(async (req, res) => {
  res.json(await calificacionService.recibidasPorConductor(req.usuario.id, req.query));
});

export const recibidasPorEstacionamiento = asyncHandler(async (req, res) => {
  res.json(await calificacionService.recibidasPorEstacionamiento(req.params.id, req.usuario.id, req.query));
});
