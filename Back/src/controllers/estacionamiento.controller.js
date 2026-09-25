import * as estacionamientoService from '../services/estacionamiento.service.js';
import * as cocheraService from '../services/cochera.service.js';
import * as reservaService from '../services/reserva.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const crear = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.crear(req.usuario.id, req.body);
  res.status(201).json({ estacionamiento });
});

export const buscar = asyncHandler(async (req, res) => {
  const estacionamientos = await estacionamientoService.buscar(req.query);
  res.json({
    estacionamientos,
    paginacion: {
      limit: req.query.limit,
      offset: req.query.offset,
      cantidad: estacionamientos.length,
    },
  });
});

export const obtener = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.obtenerPorId(req.params.id);
  res.json({ estacionamiento });
});

export const listarMios = asyncHandler(async (req, res) => {
  const estacionamientos = await estacionamientoService.listarPorPropietario(req.usuario.id);
  res.json({ estacionamientos });
});

export const actualizar = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.actualizar(
    req.params.id,
    req.usuario.id,
    req.body,
  );
  res.json({ estacionamiento });
});

export const darDeBaja = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.darDeBaja(req.params.id, req.usuario.id);
  res.json({ estacionamiento });
});

export const crearCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.crear(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ cochera });
});

export const crearLoteCocheras = asyncHandler(async (req, res) => {
  const cocheras = await cocheraService.crearLote(req.params.id, req.usuario.id, req.body.lotes);
  res.status(201).json({ cocheras });
});

export const listarCocheras =asyncHandler(async (req, res) => {
  const cocheras = await cocheraService.listarPorEstacionamiento(req.params.id);
  res.json({ cocheras });
});

export const actualizarCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.actualizar(
    req.params.id,
    req.usuario.id,
    req.params.idCochera,
    req.body,
  );
  res.json({ cochera });
});

export const darDeBajaCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.darDeBaja(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
});

export const disponibilidad = asyncHandler(async (req, res) => {
  const resultado = await reservaService.disponibilidad(req.params.id, req.query);
  res.json(resultado);
});

export const listarReservas = asyncHandler(async (req, res) => {
  const reservas = await reservaService.listarPorEstacionamiento(
    req.params.id,
    req.usuario.id,
    req.query,
  );
  res.json({ reservas });
});
