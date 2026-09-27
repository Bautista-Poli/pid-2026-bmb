import { Injectable, signal } from '@angular/core';
import { Coordenadas } from '@app/utils/distancia.util';

/**
 * - `inactiva`: todavia no se pidio.
 * - `buscando`: esperando al navegador (o a que el usuario acepte el permiso).
 * - `lista`: hay `posicion`.
 * - `denegada`: el usuario no dio permiso.
 * - `no-disponible`: el navegador no la soporta, fallo o tardo demasiado.
 */
export type EstadoUbicacion = 'inactiva' | 'buscando' | 'lista' | 'denegada' | 'no-disponible';

/** Una posicion de hace menos de 1 minuto sirve: no hace falta volver a medir. */
const OPCIONES: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 60_000,
};

/**
 * Ubicacion actual del usuario (Geolocation API del navegador).
 * Queda solo en el navegador: no se manda al backend.
 */
@Injectable({ providedIn: 'root' })
export class UbicacionService {
  private readonly _posicion = signal<Coordenadas | null>(null);
  private readonly _estado = signal<EstadoUbicacion>('inactiva');

  readonly posicion = this._posicion.asReadonly();
  readonly estado = this._estado.asReadonly();

  /**
   * Pide la ubicacion. La primera vez el navegador le pregunta al usuario;
   * despues responde solo. Si ya hay una en curso, no hace nada.
   */
  solicitar(): void {
    if (this._estado() === 'buscando') return;

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this._estado.set('no-disponible');
      return;
    }

    this._estado.set('buscando');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this._posicion.set({ latitud: coords.latitude, longitud: coords.longitude });
        this._estado.set('lista');
      },
      (error) => {
        this._estado.set(error.code === error.PERMISSION_DENIED ? 'denegada' : 'no-disponible');
      },
      OPCIONES,
    );
  }
}
