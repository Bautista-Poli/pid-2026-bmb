import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { apiInterceptor } from './interceptors/api.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { AuthService } from './services/auth.service';

registerLocaleData(localeEsAr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Los parametros de ruta (`:estacionamientoId`) llegan como inputs.
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    provideHttpClient(
      withFetch(),
      // El orden importa: base de URL -> normalizacion de errores.
      withInterceptors([apiInterceptor, errorInterceptor]),
    ),
    // La sesion vive en una cookie httpOnly (ver AuthService): antes de que
    // arranque el router hay que preguntarle a /auth/me si hay una vigente,
    // si no los guards seguros verian "sin sesion" en la primera carga.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).cargarSesion())),
    { provide: LOCALE_ID, useValue: 'es-AR' },
  ],
};
