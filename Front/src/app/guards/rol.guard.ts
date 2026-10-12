import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RolUsuario } from '@app/models';
import { AuthService } from '@app/services/auth.service';

/** Ruta de inicio segun el rol, para redirigir cuando el acceso no corresponde. */
export function inicioSegunRol(rol: RolUsuario | null): string {
  switch (rol) {
    case 'CONDUCTOR':
      return '/conductor/explorar';
    case 'PROPIETARIO':
      return '/propietario/tablero';
    case 'ADMINISTRADOR':
      return '/admin';
    default:
      return '/ingresar';
  }
}

/**
 * Restringe una rama del arbol de rutas a uno o mas roles.
 * Uso: `canActivate: [authGuard, rolGuard(['PROPIETARIO'])]`.
 */
export function rolGuard(rolesPermitidos: RolUsuario[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const rol = auth.rol();

    if (rol && rolesPermitidos.includes(rol)) {
      return true;
    }

    return router.parseUrl(inicioSegunRol(rol));
  };
}
