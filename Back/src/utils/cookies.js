import { config } from '../config/env.js';

/**
 * La sesion viaja en esta cookie httpOnly en vez de en el body de la
 * respuesta: el front nunca la lee ni la guarda a mano, asi que un XSS no
 * puede robar el token como pasaba cuando vivia en localStorage.
 */
export const COOKIE_SESION = 'parkit_token';

const UNIDADES_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Convierte duraciones tipo JWT_EXPIRES_IN ('1d', '12h') a milisegundos. */
function duracionAMs(duracion) {
  const match = /^(\d+)([smhd])$/.exec(String(duracion).trim());
  return match ? Number(match[1]) * UNIDADES_MS[match[2]] : UNIDADES_MS.d;
}

const OPCIONES_COOKIE = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  path: config.apiPrefix,
};

export function setearCookieSesion(res, token) {
  res.cookie(COOKIE_SESION, token, {
    ...OPCIONES_COOKIE,
    maxAge: duracionAMs(config.jwt.expiresIn),
  });
}

export function borrarCookieSesion(res) {
  res.clearCookie(COOKIE_SESION, OPCIONES_COOKIE);
}
