import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// Codigos de PostgreSQL que conviene traducir a un 4xx entendible.
const ERRORES_PG = {
  '23505': { status: 409, mensaje: 'Ya existe un registro con esos datos' },
  '23503': { status: 400, mensaje: 'Se referencia un registro que no existe' },
  '23514': { status: 400, mensaje: 'Los datos no cumplen una restriccion de la base' },
  '23P01': { status: 409, mensaje: 'El registro se superpone con otro existente' },
  '22P02': { status: 400, mensaje: 'Alguno de los identificadores enviados tiene formato invalido' },
};

/** Middleware final: unifica el formato de todas las respuestas de error. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let statusCode = 500;
  let mensaje = 'Error interno del servidor';
  let detalles = null;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    mensaje = err.message;
    detalles = err.details;
  } else if (err.type === 'entity.parse.failed') {
    // Body con JSON mal formado (lo lanza express.json()).
    statusCode = 400;
    mensaje = 'El cuerpo del request no es JSON valido';
  } else if (err.type === 'entity.too.large') {
    // Body mas grande que el limite del parser (lo lanza express.raw() al subir fotos).
    statusCode = 413;
    mensaje = 'El archivo es demasiado grande';
  } else if (ERRORES_PG[err.code]) {
    statusCode = ERRORES_PG[err.code].status;
    mensaje = ERRORES_PG[err.code].mensaje;
  }

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    error: {
      message: mensaje,
      ...(detalles ? { details: detalles } : {}),
      ...(!config.isProduction && statusCode >= 500 ? { stack: err.stack } : {}),
    },
  });
}
