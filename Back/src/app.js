import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';

import { config } from './config/env.js';
import routes from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// Railway y cualquier PaaS ponen un proxy delante: sin esto req.ip y el
// protocolo llegan mal.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

if (config.nodeEnv !== 'test') {
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
}

app.use(config.apiPrefix, routes);

// Manejo de errores (siempre al final)
app.use(notFound);
app.use(errorHandler);

export default app;
