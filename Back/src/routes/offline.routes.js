// Rutas del modo offline (OFFLINE=true): subir y servir fotos guardadas en disco, y el
// archivo del mapa local. Sin OFFLINE responden 404, como si no existieran.
import express, { Router } from 'express';

import { config } from '../config/env.js';
import * as local from '../services/fotos-locales.service.js';
import { ApiError } from '../utils/ApiError.js';

const router = Router();

/** Se mira en cada pedido (no al importar): las pruebas prenden OFFLINE despues. */
function soloOffline(_req, _res, next) {
  next(config.offline ? undefined : ApiError.notFound('Recurso no encontrado'));
}

router.use(soloOffline);

// El navegador manda la imagen cruda (ya achicada) y la firma en la query.
const imagen = express.raw({ type: 'image/*', limit: local.MAX_BYTES });

/** POST /api/fotos-locales?public_id&timestamp&signature (lo firma .../firma de cada recurso) */
router.post('/fotos-locales', imagen, async (req, res) => {
  const { public_id: publicId, timestamp, signature } = req.query;
  if (!local.publicIdValido(publicId)) throw ApiError.badRequest('public_id invalido');
  local.asegurarFirma(publicId, timestamp, signature);
  await local.guardar(publicId, req.body);
  res.status(201).json({ public_id: publicId });
});

/** GET /api/fotos-locales/<public_id> (publico, como las URLs de Cloudinary) */
router.get('/fotos-locales/*ruta', async (req, res) => {
  const foto = await local.buscar(req.params.ruta.join('/'));
  if (!foto) throw ApiError.notFound('Foto no encontrada');
  // Un public_id nuevo por cada subida: la misma URL casi nunca cambia de contenido.
  res.sendFile(foto.ruta, { headers: { 'Content-Type': foto.mime }, maxAge: '1d' });
});

// GET /api/mapa/<archivo>.pmtiles: el mapa offline (npm run offline:mapa). El
// front lo lee de a pedazos con pedidos Range, que express.static ya resuelve.
router.use('/mapa', (req, res, next) => express.static(config.datosLocales.mapa, { maxAge: '7d' })(req, res, next));

export default router;
