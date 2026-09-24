import * as estacionamientoService from '../services/estacionamiento.service.js';
import * as fotoService from '../services/estacionamiento-foto.service.js';
import * as cocheraService from '../services/cochera.service.js';
import * as reservaService from '../services/reserva.service.js';
import { ApiError } from '../utils/ApiError.js';
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
  const cocheras = await cocheraService.crearLote(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ cocheras });
});

export const listarCocheras = asyncHandler(async (req, res) => {
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

/** La foto es publica: el detalle del estacionamiento se navega sin sesion. */
export const obtenerFoto = asyncHandler(async (req, res) => {
  const foto = await fotoService.obtener(req.params.id);
  if (!foto) throw ApiError.notFound('El estacionamiento no tiene foto');

  res.type(foto.mime);
  res.set('Cache-Control', 'public, max-age=300');
  res.set('ETag', `W/"${foto.actualizada.getTime()}"`);
  res.send(foto.bytes);
});

/**
 * El body es la imagen cruda (lo arma express.raw en la ruta). Se mira el
 * arranque del archivo y no solo el Content-Type, asi un header mentido no
 * termina guardando cualquier cosa en la base.
 */
export const guardarFoto = asyncHandler(async (req, res) => {
  const bytes = req.body;
  // Con un Content-Type que no matchea, express.raw deja req.body en {}.
  const mime = Buffer.isBuffer(bytes) && bytes.length > 0 ? tipoDeImagen(bytes) : null;
  if (!mime) throw ApiError.badRequest('Subi una imagen JPG, PNG o WEBP de hasta 2 MB');

  const foto = await fotoService.guardar(req.params.id, req.usuario.id, mime, bytes);
  res.json({ foto });
});

export const borrarFoto = asyncHandler(async (req, res) => {
  await fotoService.borrar(req.params.id, req.usuario.id);
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
