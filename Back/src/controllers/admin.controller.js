// Controllers del administrador (todo /api/admin): revision de estacionamientos,
// moderacion de incidencias y de reseñas denunciadas, y estadisticas de la plataforma.
import * as adminEstadisticaService from '../services/admin-estadistica.service.js';
import * as adminService from '../services/admin.service.js';
import * as denunciaService from '../services/denuncia-resena.service.js';
import * as moderacionService from '../services/moderacion.service.js';
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

/** GET /api/admin/incidencias (admin) */
export const listarIncidencias = asyncHandler(async (req, res) => {
  res.json({ incidencias: await moderacionService.listar(req.query) });
});

/** GET /api/admin/incidencias/:id (admin) */
export const obtenerIncidencia = asyncHandler(async (req, res) => {
  res.json({ incidencia: await moderacionService.obtener(req.params.id) });
});

/** POST /api/admin/incidencias/:id/mensajes (admin) */
export const escribirEnIncidencia = asyncHandler(async (req, res) => {
  const incidencia = await moderacionService.escribir(req.usuario, req.params.id, req.body);
  res.status(201).json({ incidencia });
});

/** PATCH /api/admin/incidencias/:id/resolver (admin) */
export const resolverIncidencia = asyncHandler(async (req, res) => {
  res.json({ incidencia: await moderacionService.resolver(req.usuario, req.params.id, req.body) });
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
