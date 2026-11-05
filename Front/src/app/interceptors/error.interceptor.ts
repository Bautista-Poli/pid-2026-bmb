import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { RespuestaError } from '@app/models';
import { AuthService } from '@app/services/auth.service';

/**
 * Normaliza el formato de error de Express (`{ error: { message, details } }`)
 * a un Error con mensaje mostrable, y cierra la sesion si un 401 tira abajo
 * una que estaba vigente.
 *
 * Un 401 sin sesion previa no cuenta: es lo que responde `/auth/me` al
 * arrancar la app cuando todavia no se sabe si hay cookie (`cargarSesion` en
 * `AuthService`), y forzar la redireccion ahi mandaria a cualquier pantalla
 * publica derecho al login.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Las URL absolutas son servicios externos (Cloudinary para las fotos, Georef
  // y Photon para las direcciones): sus errores no tienen que ver con la sesion
  // de Parkit y su mensaje no es para mostrar tal cual.
  if (/^https?:\/\//i.test(req.url)) {
    const mensaje = /^https?:\/\/api\.cloudinary\.com\//i.test(req.url)
      ? 'No pudimos subir la foto. Probá de nuevo en un rato.'
      : 'No pudimos consultar el servicio externo. Probá de nuevo en un rato.';
    return next(req).pipe(catchError(() => throwError(() => new Error(mensaje))));
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && auth.estaAutenticado()) {
        auth.logout().subscribe();
        void router.navigate(['/ingresar']);
      }

      return throwError(() => new ErrorApi(mensajeDe(error), error.status, detallesDe(error)));
    }),
  );
};

/** Error de la API de Parkit: ademas del mensaje, conserva el status y `details`. */
export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detalles: unknown,
  ) {
    super(message);
  }
}

function detallesDe(error: HttpErrorResponse): unknown {
  const cuerpo = error.error as RespuestaError | string | null;
  return cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo ? (cuerpo.error.details ?? null) : null;
}

/** El mensaje para mostrar: el del back ({ error: { message } }) o uno generico. */
function mensajeDe(error: HttpErrorResponse): string {
  const cuerpo = error.error as RespuestaError | string | null;

  if (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo) {
    const detalle = primerDetalle(cuerpo.error.details);
    return detalle ? `${cuerpo.error.message}: ${detalle}` : cuerpo.error.message;
  }
  if (error.status === 0) {
    return 'No pudimos conectarnos con el servidor';
  }
  return typeof cuerpo === 'string' && cuerpo ? cuerpo : 'Ocurrio un error inesperado';
}

/** Los errores de validacion traen `[{ campo, mensaje }]`: se muestra el primero. */
function primerDetalle(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const { campo, mensaje } = details[0] as { campo?: unknown; mensaje?: unknown };
  return typeof campo === 'string' && typeof mensaje === 'string' ? `${campo} ${mensaje}` : null;
}
