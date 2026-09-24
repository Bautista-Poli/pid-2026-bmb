import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { borrarCookieSesion, setearCookieSesion } from '../utils/cookies.js';

export const register = asyncHandler(async (req, res) => {
  const { usuario, token } = await authService.registrar(req.body);
  setearCookieSesion(res, token);
  res.status(201).json({ usuario });
});

export const login = asyncHandler(async (req, res) => {
  const { usuario, token } = await authService.login(req.body);
  setearCookieSesion(res, token);
  res.json({ usuario });
});

export const perfil = asyncHandler(async (req, res) => {
  const usuario = await authService.obtenerPerfil(req.usuario.id);
  res.json({ usuario });
});

export const cambiarRol = asyncHandler(async (req, res) => {
  const { usuario, token } = await authService.cambiarRol(req.usuario.id, req.body.rol);
  setearCookieSesion(res, token);
  res.json({ usuario });
});

export const actualizarPerfil = asyncHandler(async (req, res) => {
  const { usuario, token } = await authService.actualizarPerfil(req.usuario.id, req.body);
  setearCookieSesion(res, token);
  res.json({ usuario });
});

export const eliminarCuenta = asyncHandler(async (req, res) => {
  await authService.eliminarCuenta(req.usuario.id);
  borrarCookieSesion(res);
  res.status(204).end();
});

/** La cookie es httpOnly: el front no la puede borrar solo, necesita este endpoint. */
export const logout = asyncHandler(async (_req, res) => {
  borrarCookieSesion(res);
  res.status(204).end();
});
