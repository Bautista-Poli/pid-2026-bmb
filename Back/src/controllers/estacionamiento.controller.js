// Controllers de /api/estacionamientos: busqueda, detalle y ABM del estacionamiento,
// sus cocheras, fotos, disponibilidad, reservas recibidas y reputacion.
import * as estacionamientoService from '../services/estacionamiento.service.js';
import * as fotos from '../services/fotos.service.js';
import * as fotoService from '../services/estacionamiento-foto.service.js';
import * as cocheraService from '../services/cochera.service.js';
import * as reputacionService from '../services/reputacion.service.js';
import * as reservaService from '../services/reserva.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../utils/roles.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** POST /api/estacionamientos (propietario) */
export const crear = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.crear(req.usuario.id, req.body);
  res.status(201).json({ estacionamiento });
});

/** GET /api/estacionamientos (publico) */
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

/** GET /api/estacionamientos/:id (publico, con sesion opcional) */
export const obtener = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.obtenerPorId(req.params.id, {
    idSolicitante: req.usuario?.id ?? null,
    esAdmin: req.usuario?.rol === ROLES.ADMINISTRADOR,
  });
  res.json({ estacionamiento });
});

/** GET /api/estacionamientos/mios (propietario) */
export const listarMios = asyncHandler(async (req, res) => {
  const estacionamientos = await estacionamientoService.listarPorPropietario(req.usuario.id);
  res.json({ estacionamientos });
});

/** PATCH /api/estacionamientos/:id (propietario) */
export const actualizar = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.actualizar(
    req.params.id,
    req.usuario.id,
    req.body,
  );
  res.json({ estacionamiento });
});

/** PATCH /api/estacionamientos/:id/reenviar-revision (propietario) */
export const reenviarRevision = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.reenviarRevision(req.params.id, req.usuario.id);
  res.json({ estacionamiento });
});

/** DELETE /api/estacionamientos/:id (propietario) */
export const darDeBaja = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.darDeBaja(req.params.id, req.usuario.id);
  res.json({ estacionamiento });
});

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
export const listarCocheras =asyncHandler(async (req, res) => {
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
  const cochera = await cocheraService.darDeBaja(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
});

/** POST /api/estacionamientos/:id/cocheras/:idCochera/reactivar (propietario) */
export const reactivarCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.reactivar(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
});

/** DELETE /api/estacionamientos/:id/cocheras/:idCochera/definitiva (propietario) */
export const eliminarCochera = asyncHandler(async (req, res) => {
  await cocheraService.eliminar(req.params.id, req.usuario.id, req.params.idCochera);
  res.status(204).end();
});

/** POST /api/estacionamientos/:id/cocheras/:idCochera/bloquear (propietario) */
export const bloquearCochera = asyncHandler(async (req, res) => {
  const resultado = await cocheraService.bloquear(
    req.params.id,
    req.usuario.id,
    req.params.idCochera,
    req.body,
  );
  res.json(resultado);
});

/** POST /api/estacionamientos/:id/cocheras/:idCochera/desbloquear (propietario) */
export const desbloquearCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.desbloquear(req.params.id, req.usuario.id, req.params.idCochera);
  res.json({ cochera });
});

/** GET /api/estacionamientos/:id/disponibilidad (publico) */
export const disponibilidad = asyncHandler(async (req, res) => {
  const resultado = await reservaService.disponibilidad(req.params.id, req.query);
  res.json(resultado);
});

/** GET /api/estacionamientos/:id/reservas (propietario) */
export const listarReservas = asyncHandler(async (req, res) => {
  const reservas = await reservaService.listarPorEstacionamiento(
    req.params.id,
    req.usuario.id,
    req.query,
  );
  res.json({ reservas });
});

/**
 * Manda una foto: si esta en disco (public_id), redirige a su URL; si no, los bytes
 * con cache corto y ETag por version.
 */
function enviarFoto(res, foto) {
  if (foto.public_id) {
    res.set('Cache-Control', 'public, max-age=300');
    res.redirect(302, fotos.url(foto.public_id));
    return;
  }
  res.type(foto.mime);
  res.set('Cache-Control', 'public, max-age=300');
  res.set('ETag', `W/"${foto.actualizada.getTime()}"`);
  res.send(foto.bytes);
}

/**
 * El body es la imagen cruda (lo arma express.raw en la ruta). Se mira el
 * arranque del archivo y no solo el Content-Type, asi un header mentido no
 * termina guardando cualquier cosa en la base.
 */
function imagenDelBody(req) {
  // El camino normal: la foto ya se subio (POST /fotos-locales) y llega su public_id.
  if (req.body && typeof req.body.public_id === 'string') return { publicId: req.body.public_id };

  const bytes = req.body;
  // Con un Content-Type que no matchea, express.raw deja req.body en {}.
  const mime = Buffer.isBuffer(bytes) && bytes.length > 0 ? tipoDeImagen(bytes) : null;
  if (!mime) throw ApiError.badRequest('Subi una imagen JPG, PNG o WEBP de hasta 2 MB');
  return { mime, bytes };
}

/**
 * GET /api/estacionamientos/:id/foto (publico)
 * Las fotos son publicas: el detalle del estacionamiento se navega sin sesion.
 */
export const obtenerFoto = asyncHandler(async (req, res) => {
  const foto = await fotoService.obtenerPortada(req.params.id);
  if (!foto) throw ApiError.notFound('El estacionamiento no tiene foto');
  enviarFoto(res, foto);
});

/** PUT /api/estacionamientos/:id/foto (propietario) */
export const guardarFoto = asyncHandler(async (req, res) => {
  const foto = await fotoService.guardarPortada(req.params.id, req.usuario.id, imagenDelBody(req));
  res.json({ foto });
});

/**
 * POST /api/estacionamientos/:id/fotos/firma (propietario)
 * Firma para que el navegador suba una foto a /api/fotos-locales.
 */
export const firmarFoto = asyncHandler(async (req, res) => {
  const firma = await fotoService.firmar(req.params.id, req.usuario.id);
  res.json({ firma });
});

/** DELETE /api/estacionamientos/:id/foto (propietario) */
export const borrarFoto = asyncHandler(async (req, res) => {
  await fotoService.borrarPortada(req.params.id, req.usuario.id);
  res.status(204).end();
});

/** GET /api/estacionamientos/:id/fotos/:idFoto (publico) */
export const obtenerFotoDeGaleria = asyncHandler(async (req, res) => {
  const foto = await fotoService.obtener(req.params.id, req.params.idFoto);
  if (!foto) throw ApiError.notFound('Foto no encontrada');
  enviarFoto(res, foto);
});

/** POST /api/estacionamientos/:id/fotos (propietario) */
export const agregarFoto = asyncHandler(async (req, res) => {
  const foto = await fotoService.agregar(req.params.id, req.usuario.id, imagenDelBody(req));
  res.status(201).json({ foto });
});

/** DELETE /api/estacionamientos/:id/fotos/:idFoto (propietario) */
export const borrarFotoDeGaleria = asyncHandler(async (req, res) => {
  await fotoService.borrar(req.params.id, req.usuario.id, req.params.idFoto);
  res.status(204).end();
});

/** El mime real segun los primeros bytes del archivo, o null si no es imagen. */
function tipoDeImagen(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(FIRMA_PNG)) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** GET /api/estacionamientos/:id/reputacion (propietario) */
export const reputacion = asyncHandler(async (req, res) => {
  res.json(await reputacionService.delEstacionamiento(req.params.id, req.usuario.id, req.query));
});
