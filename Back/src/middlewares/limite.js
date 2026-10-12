import { ApiError } from '../utils/ApiError.js';

/**
 * Limite simple de pedidos por usuario, en memoria (alcanza con una sola
 * instancia de la API). Usar despues de `authenticate`.
 *
 * Lo usan las firmas de Cloudinary: cada una habilita una subida a la cuenta,
 * asi que un usuario no deberia poder pedir cientos.
 */
/** Cada firma de Cloudinary habilita una subida: 30 cada 10 minutos sobran. */
export const LIMITE_FIRMAS = Object.freeze({ maximo: 30, ventanaMs: 10 * 60 * 1000 });

export function limitarPorUsuario({ maximo, ventanaMs }) {
  const pedidos = new Map();

  return (req, _res, next) => {
    const ahora = Date.now();
    const clave = req.usuario?.id ?? req.ip;
    const recientes = (pedidos.get(clave) ?? []).filter((instante) => ahora - instante < ventanaMs);

    if (recientes.length >= maximo) {
      return next(new ApiError(429, 'Hiciste demasiados pedidos seguidos, espera unos minutos'));
    }
    recientes.push(ahora);
    pedidos.set(clave, recientes);
    return next();
  };
}
