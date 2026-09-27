/**
 * Contratos genericos de la API de Parkit (Express).
 * El backend unifica los errores en `{ error: { message, details? } }`
 * (ver Back/src/middlewares/errorHandler.js).
 */

export interface RespuestaError {
  error: {
    message: string;
    details?: unknown;
    stack?: string;
  };
}

/** Fecha en formato ISO (`2026-09-04`). */
export type FechaISO = string;

/** Hora en formato 24hs (`08:30`). */
export type HoraHHmm = string;

/** Marca temporal ISO 8601 completa. */
export type FechaHoraISO = string;

export type Id = string;
