import { url } from '../services/cloudinary.service.js';
import * as vehiculoService from '../services/vehiculo.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** El `public_id` se queda en el back: el front recibe la URL lista. */
function aRespuesta(vehiculo) {
  if (!vehiculo) return vehiculo;
  const { foto_public_id: publicId, ...resto } = vehiculo;
  return { ...resto, foto_url: publicId ? url(publicId, { ancho: 800 }) : null };
}

export const crear = asyncHandler(async (req, res) => {
  const vehiculo = await vehiculoService.crear(req.usuario.id, req.body);
  res.status(201).json({ vehiculo: aRespuesta(vehiculo) });
});

export const listarMios = asyncHandler(async (req, res) => {
  const vehiculos = await vehiculoService.listarPorConductor(req.usuario.id);
  res.json({ vehiculos: vehiculos.map(aRespuesta) });
});

export const actualizar = asyncHandler(async (req, res) => {
  const vehiculo = await vehiculoService.actualizar(req.params.id, req.usuario.id, req.body);
  res.json({ vehiculo: aRespuesta(vehiculo) });
});

export const eliminar = asyncHandler(async (req, res) => {
  const vehiculo = await vehiculoService.darDeBaja(req.params.id, req.usuario.id);
  res.json({ vehiculo: aRespuesta(vehiculo) });
});

export const listarTipos = asyncHandler(async (_req, res) => {
  const tipos = await vehiculoService.listarTipos();
  res.json({ tipos });
});

export const firmarFoto = asyncHandler(async (req, res) => {
  const firma = await vehiculoService.firmarFoto(req.params.id, req.usuario.id);
  res.json({ firma });
});

export const guardarFoto = asyncHandler(async (req, res) => {
  if (typeof req.body?.public_id !== 'string') throw ApiError.badRequest('Falta el public_id de la foto');
  const vehiculo = await vehiculoService.guardarFoto(req.params.id, req.usuario.id, req.body.public_id);
  res.json({ vehiculo: aRespuesta(vehiculo) });
});

export const borrarFoto = asyncHandler(async (req, res) => {
  await vehiculoService.borrarFoto(req.params.id, req.usuario.id);
  res.status(204).end();
});
