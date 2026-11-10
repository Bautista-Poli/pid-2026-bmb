// Monta cada grupo de rutas bajo su prefijo (/auth, /estacionamientos, …). app.js
// lo cuelga de /api, asi que todo queda en /api/<prefijo>/…
import { Router } from 'express';

import abonoRoutes from './abono.routes.js';
import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import calificacionRoutes from './calificacion.routes.js';
import estacionamientoRoutes from './estacionamiento.routes.js';
import estadisticaRoutes from './estadistica.routes.js';
import incidenciaRoutes from './incidencia.routes.js';
import mapaRoutes from './mapa.routes.js';
import reservaRoutes from './reserva.routes.js';
import vehiculoRoutes from './vehiculo.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', servicio: 'Parkit API' }));

router.use('/auth', authRoutes);
router.use('/estacionamientos', estacionamientoRoutes);
router.use('/vehiculos', vehiculoRoutes);
router.use('/reservas', reservaRoutes);
router.use('/abonos', abonoRoutes);
router.use('/admin', adminRoutes);
router.use('/incidencias', incidenciaRoutes);
router.use('/estadisticas', estadisticaRoutes);
router.use('/calificaciones', calificacionRoutes);
// El mapa local (/mapa).
router.use(mapaRoutes);

export default router;
