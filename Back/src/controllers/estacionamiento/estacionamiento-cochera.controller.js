// Controllers de las cocheras de un estacionamiento: /api/estacionamientos/:id/cocheras/...
import * as cocheraService from '../../services/cochera/cochera.service.js';
import * as cocheraBajaService from '../../services/cochera/cochera-baja.service.js';
import * as bloqueoService from '../../services/cochera/cochera-bloqueo.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

/** POST /api/estacionamientos/:id/cocheras (propietario) */
export const crearCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.crear(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ cochera });
});

/** POST /api/estacionamientos/:id/cocheras/lote (propietario) */
export const crearLoteCocheras = asyncHandler(async (req, res) => {
  const cocheras = await cocheraService.crearLote(req.params.id, req.usuario.id, req.body.lotes);
  res.status(201).json({ cocheras });
});

/** GET /api/estacionamientos/:id/cocheras (publico) */
export const listarCocheras = asyncHandler(async (req, res) => {
  const cocheras = await cocheraService.listarPorEstacionamiento(req.params.id);
  res.json({ cocheras });
});

/** PATCH /api/estacionamientos/:id/cocheras/:idCochera (propietario) */
export const actualizarCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.actualizar(
    req.params.id,
    req.usuario.id,
    req.params.idCochera,
    req.body,
  );
  res.json({ cochera });
});

/** DELETE /api/estacionamientos/:id/cocheras/:idCochera (propietario) */
export const darDeBajaCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraBajaService.darDeBaja(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
});

/** POST /api/estacionamientos/:id/cocheras/:idCochera/reactivar (propietario) */
export const reactivarCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraBajaService.reactivar(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
});

/** DELETE /api/estacionamientos/:id/cocheras/:idCochera/definitiva (propietario) */
export const eliminarCochera = asyncHandler(async (req, res) => {
  await cocheraBajaService.eliminar(req.params.id, req.usuario.id, req.params.idCochera);
  res.status(204).end();
});

/** POST /api/estacionamientos/:id/cocheras/:idCochera/bloquear (propietario) */
export const bloquearCochera = asyncHandler(async (req, res) => {
  const resultado = await bloqueoService.bloquear(
    req.params.id,
    req.usuario.id,
    req.params.idCochera,
    req.body,
  );
  res.json(resultado);
});

/** POST /api/estacionamientos/:id/cocheras/:idCochera/desbloquear (propietario) */
export const desbloquearCochera = asyncHandler(async (req, res) => {
  const cochera = await bloqueoService.desbloquear(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
});
