// Controllers del administrador (todo /api/admin): revision de estacionamientos,
// moderacion de reseñas denunciadas y estadisticas de la plataforma.
import * as adminEstadisticaService from '../services/admin-estadistica.service.js';
import * as adminService from '../services/admin.service.js';
import * as denunciaService from '../services/denuncia-resena.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** GET /api/admin/estacionamientos (admin) */
export const listarEstacionamientos = asyncHandler(async (req, res) => {
  const estacionamientos = await adminService.listarEstacionamientos(req.query);
  res.json({ estacionamientos });
});

/** GET /api/admin/estacionamientos/:id (admin) */
export const obtenerEstacionamiento = asyncHandler(async (req, res) => {
  const estacionamiento = await adminService.obtenerEstacionamiento(req.params.id);
  res.json({ estacionamiento });
});

/** PATCH /api/admin/estacionamientos/:id/aprobar (admin) */
export const aprobar = asyncHandler(async (req, res) => {
  const estacionamiento = await adminService.aprobar(req.params.id, req.usuario.id, req.body);
  res.json({ estacionamiento });
});

/** PATCH /api/admin/estacionamientos/:id/rechazar (admin) */
export const rechazar = asyncHandler(async (req, res) => {
  const estacionamiento = await adminService.rechazar(req.params.id, req.usuario.id, req.body);
  res.json({ estacionamiento });
});

/** GET /api/admin/estadisticas (admin) */
export const estadisticas = asyncHandler(async (req, res) => {
  res.json({ estadisticas: await adminEstadisticaService.estadisticas(req.query) });
});

/** GET /api/admin/resenas (admin) */
export const listarResenas = asyncHandler(async (req, res) => {
  res.json({ resenas: await denunciaService.listarDenuncias(req.query) });
});

/** PATCH /api/admin/resenas/:id/desestimar (admin) */
export const desestimarResena = asyncHandler(async (req, res) => {
  res.json({ resena: await denunciaService.moderar(req.params.id, req.usuario.id, 'DESESTIMAR') });
});

/** PATCH /api/admin/resenas/:id/ocultar (admin) */
export const ocultarResena = asyncHandler(async (req, res) => {
  res.json({ resena: await denunciaService.moderar(req.params.id, req.usuario.id, 'OCULTAR') });
});
