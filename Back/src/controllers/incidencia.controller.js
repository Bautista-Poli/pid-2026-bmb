import * as incidenciaService from '../services/incidencia.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listar = asyncHandler(async (req, res) => {
  res.json({ incidencias: await incidenciaService.listar(req.usuario) });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ incidencia: await incidenciaService.obtener(req.usuario, req.params.id) });
});

export const responder = asyncHandler(async (req, res) => {
  const incidencia = await incidenciaService.responder(req.usuario, req.params.id, req.body);
  res.status(201).json({ incidencia });
});

export const resolver = asyncHandler(async (req, res) => {
  res.json({ incidencia: await incidenciaService.resolver(req.usuario, req.params.id, req.body) });
});

export const denunciar = asyncHandler(async (req, res) => {
  res.json({ incidencia: await incidenciaService.denunciar(req.usuario, req.params.id, req.body) });
});
