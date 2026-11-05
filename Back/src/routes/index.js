// Monta cada grupo de rutas bajo su prefijo (/auth, /estacionamientos, …). app.js
// lo cuelga de /api, asi que todo queda en /api/<prefijo>/…
import { Router } from 'express';

import { config } from '../config/env.js';

import abonoRoutes from './abono.routes.js';
import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import calificacionRoutes from './calificacion.routes.js';
import estacionamientoRoutes from './estacionamiento.routes.js';
import estadisticaRoutes from './estadistica.routes.js';
import incidenciaRoutes from './incidencia.routes.js';
import offlineRoutes from './offline.routes.js';
import reservaRoutes from './reserva.routes.js';
import vehiculoRoutes from './vehiculo.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', servicio: 'Parkit API' }));
// Lo que el front tiene que saber del entorno antes de arrancar (p. ej. si usa el mapa local).
router.get('/entorno', (_req, res) => res.json({ offline: config.offline }));

router.use('/auth', authRoutes);
router.use('/estacionamientos', estacionamientoRoutes);
router.use('/vehiculos', vehiculoRoutes);
router.use('/reservas', reservaRoutes);
router.use('/abonos', abonoRoutes);
router.use('/admin', adminRoutes);
router.use('/incidencias', incidenciaRoutes);
router.use('/estadisticas', estadisticaRoutes);
router.use('/calificaciones', calificacionRoutes);
// Ultimo: sin OFFLINE responde 404 a todo lo que llegue hasta aca.
router.use(offlineRoutes);

export default router;
