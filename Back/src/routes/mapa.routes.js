// El archivo del mapa local.
import express, { Router } from 'express';

import { config } from '../config/env.js';

const router = Router();

// GET /api/mapa/<archivo>.pmtiles: el mapa de CABA (Back/datos-locales/mapa). El
// front lo lee de a pedazos con pedidos Range, que express.static ya resuelve.
router.use('/mapa', (req, res, next) => express.static(config.datosLocales.mapa, { maxAge: '7d' })(req, res, next));

export default router;
