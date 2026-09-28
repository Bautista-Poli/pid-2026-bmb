import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { invitadoGuard } from './guards/invitado.guard';
import { rolGuard } from './guards/rol.guard';

/**
 * Arbol de rutas dividido por rol. Cada rama tiene su layout y sus guards, y
 * espeja la estructura de `pages/`: la ruta `/propietario/tablero` se resuelve
 * en `pages/propietario/tablero/`.
 *
 *   /ingresar, /registrarse   -> pages/acceso/       (sin sesion)
 *   /conductor/...            -> pages/conductor/    (rol CONDUCTOR)
 *   /propietario/...          -> pages/propietario/  (rol PROPIETARIO)
 *
 * `authGuard` exige sesion; `rolGuard` verifica que el rol corresponda.
 */
export const routes: Routes = [
  /* -------------------------------- ACCESO -------------------------------- */
  {
    path: 'ingresar',
    title: 'Parkit · Ingresar',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./pages/ingresar/ingresar').then((m) => m.Ingresar),
  },
  {
    path: 'registrarse',
    title: 'Parkit · Crear cuenta',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./pages/registro/registro').then((m) => m.Registro),
  },

  /* ------------------------------- CONDUCTOR ------------------------------ */
  {
    path: 'conductor',
    canActivate: [authGuard, rolGuard(['CONDUCTOR'])],
    loadComponent: () => import('./layouts/layout-app/layout-app').then((m) => m.LayoutApp),
    children: [
      {
        // Explorar es el mapa: busqueda, filtros y resultados sobre el mapa.
        path: 'explorar',
        title: 'Parkit · Explorar',
        loadComponent: () => import('./pages/conductor/mapa/mapa').then((m) => m.Mapa),
      },
      // Direccion vieja de la vista de mapa, por si quedo en algun enlace o favorito.
      { path: 'mapa', pathMatch: 'full', redirectTo: 'explorar' },
      {
        path: 'reservar/:estacionamientoId',
        title: 'Parkit · Reservar',
        loadComponent: () => import('./pages/conductor/reservar/reservar').then((m) => m.Reservar),
      },
      {
        path: 'mis-reservas',
        title: 'Parkit · Mis reservas',
        loadComponent: () =>
          import('./pages/conductor/mis-reservas/mis-reservas').then((m) => m.MisReservas),
      },
      {
        path: 'vehiculos',
        title: 'Parkit · Mis vehículos',
        loadComponent: () =>
          import('./pages/conductor/vehiculos/vehiculos').then((m) => m.Vehiculos),
      },
      {
        path: 'vehiculos/nuevo',
        title: 'Parkit · Nuevo vehículo',
        loadComponent: () =>
          import('./pages/conductor/alta-vehiculo/alta-vehiculo').then((m) => m.AltaVehiculo),
      },
      {
        path: 'vehiculos/:vehiculoId/editar',
        title: 'Parkit · Editar vehículo',
        loadComponent: () =>
          import('./pages/conductor/editar-vehiculo/editar-vehiculo').then((m) => m.EditarVehiculo),
      },
      {
        path: 'perfil',
        title: 'Parkit · Mi perfil',
        loadComponent: () => import('./pages/perfil/perfil').then((m) => m.Perfil),
      },
      { path: '', pathMatch: 'full', redirectTo: 'explorar' },
    ],
  },

  /* ------------------------------ PROPIETARIO ----------------------------- */
  {
    path: 'propietario',
    canActivate: [authGuard, rolGuard(['PROPIETARIO'])],
    loadComponent: () => import('./layouts/layout-app/layout-app').then((m) => m.LayoutApp),
    children: [
      {
        path: 'tablero',
        title: 'Parkit · Tablero',
        loadComponent: () => import('./pages/propietario/tablero/tablero').then((m) => m.Tablero),
      },
      {
        path: 'reservas',
        title: 'Parkit · Reservas recibidas',
        loadComponent: () =>
          import('./pages/propietario/reservas/reservas').then((m) => m.Reservas),
      },
      {
        path: 'estacionamientos',
        title: 'Parkit · Mis estacionamientos',
        loadComponent: () =>
          import('./pages/propietario/estacionamientos/estacionamientos').then(
            (m) => m.Estacionamientos,
          ),
      },
      {
        path: 'estacionamientos/nuevo',
        title: 'Parkit · Nuevo estacionamiento',
        loadComponent: () =>
          import('./pages/propietario/alta-estacionamiento/alta-estacionamiento').then(
            (m) => m.AltaEstacionamiento,
          ),
      },
      {
        path: 'estacionamientos/:estacionamientoId/editar',
        title: 'Parkit · Editar estacionamiento',
        loadComponent: () =>
          import('./pages/propietario/editar-estacionamiento/editar-estacionamiento').then(
            (m) => m.EditarEstacionamiento,
          ),
      },
      {
        path: 'estacionamientos/:estacionamientoId/cocheras',
        title: 'Parkit · Cocheras',
        loadComponent: () =>
          import('./pages/propietario/cocheras/cocheras').then((m) => m.Cocheras),
      },
      {
        path: 'perfil',
        title: 'Parkit · Mi perfil',
        loadComponent: () => import('./pages/perfil/perfil').then((m) => m.Perfil),
      },
      { path: '', pathMatch: 'full', redirectTo: 'tablero' },
    ],
  },

  /* -------------------------------- CAJONES ------------------------------- */
  { path: '', pathMatch: 'full', redirectTo: 'ingresar' },
  { path: '**', redirectTo: 'ingresar' },
];
