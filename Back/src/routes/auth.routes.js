import { Router } from 'express';

import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  validarCambioRol,
  validarCambiosPerfil,
  validarLogin,
  validarRegistro,
} from '../validators/auth.validator.js';

const router = Router();

router.post('/register', validate(validarRegistro), authController.register);
router.post('/login', validate(validarLogin), authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.perfil);
router.patch('/me', authenticate, validate(validarCambiosPerfil), authController.actualizarPerfil);
router.delete('/me', authenticate, authController.eliminarCuenta);
router.post('/rol', authenticate, validate(validarCambioRol), authController.cambiarRol);

export default router;
