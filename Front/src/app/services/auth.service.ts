import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { CambiosPerfil, Credenciales, RegistroUsuario, RolUsuario, Usuario } from '@app/models';
import { UsuarioDto } from './api/api.dto';
import { aPayloadRegistro, aUsuario } from './api/api.mapeo';

/**
 * Sesion del usuario y llamadas a `/api/auth`.
 *
 * La sesion vive en una cookie httpOnly que pone el backend (`/auth/login`,
 * etc.): el front nunca la lee ni la guarda, asi que no hay token que un XSS
 * pueda robar. Como consecuencia, al arrancar la app no hay nada en el
 * cliente que diga "hay sesion" -- hay que preguntarle a `/auth/me` (ver
 * `cargarSesion`, que dispara `app.config.ts` antes de habilitar el router).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly ruta = '/auth';

  private readonly usuarioActual = signal<Usuario | null>(null);

  readonly usuario = this.usuarioActual.asReadonly();
  readonly rol = computed<RolUsuario | null>(() => this.usuario()?.rol ?? null);
  readonly estaAutenticado = computed(() => this.usuario() !== null);
  readonly esConductor = computed(() => this.rol() === 'CONDUCTOR');
  readonly esPropietario = computed(() => this.rol() === 'PROPIETARIO');

  /**
   * Pregunta si hay una sesion vigente y la deja cargada. Nunca lanza: sin
   * cookie o con una vencida, `/auth/me` responde 401 y queda sin sesion.
   */
  cargarSesion(): Observable<Usuario | null> {
    return this.perfil().pipe(
      tap((usuario) => this.usuarioActual.set(usuario)),
      catchError(() => {
        this.usuarioActual.set(null);
        return of(null);
      }),
    );
  }

  /** `POST /api/auth/login` */
  login(credenciales: Credenciales): Observable<Usuario> {
    return this.http.post<{ usuario: UsuarioDto }>(`${this.ruta}/login`, credenciales).pipe(
      map((respuesta) => aUsuario(respuesta.usuario)),
      tap((usuario) => this.usuarioActual.set(usuario)),
    );
  }

  /** `POST /api/auth/register` */
  registro(datos: RegistroUsuario): Observable<Usuario> {
    return this.http
      .post<{ usuario: UsuarioDto }>(`${this.ruta}/register`, aPayloadRegistro(datos))
      .pipe(
        map((respuesta) => aUsuario(respuesta.usuario)),
        tap((usuario) => this.usuarioActual.set(usuario)),
      );
  }

  /** `GET /api/auth/me` */
  perfil(): Observable<Usuario> {
    return this.http
      .get<{ usuario: UsuarioDto }>(`${this.ruta}/me`)
      .pipe(map((respuesta) => aUsuario(respuesta.usuario)));
  }

  /** `POST /api/auth/rol`: cambia el perfil activo. */
  cambiarRol(rol: RolUsuario): Observable<Usuario> {
    return this.http.post<{ usuario: UsuarioDto }>(`${this.ruta}/rol`, { rol }).pipe(
      map((respuesta) => aUsuario(respuesta.usuario)),
      tap((usuario) => this.usuarioActual.set(usuario)),
    );
  }

  /** `PATCH /api/auth/me`: guarda los cambios y actualiza la sesion. */
  actualizarPerfil(cambios: CambiosPerfil): Observable<Usuario> {
    return this.http.patch<{ usuario: UsuarioDto }>(`${this.ruta}/me`, cambios).pipe(
      map((respuesta) => aUsuario(respuesta.usuario)),
      tap((usuario) => this.usuarioActual.set(usuario)),
    );
  }

  /** `DELETE /api/auth/me`: baja de la cuenta y cierre de sesion. */
  eliminarCuenta(): Observable<void> {
    return this.http
      .delete<void>(`${this.ruta}/me`)
      .pipe(tap(() => this.usuarioActual.set(null)));
  }

  /**
   * `POST /api/auth/logout`. La sesion local se limpia al toque (no depende
   * de la red); la cookie es httpOnly, asi que hace falta este pedido para
   * que el backend la borre.
   */
  logout(): Observable<void> {
    this.usuarioActual.set(null);
    return this.http.post<void>(`${this.ruta}/logout`, null);
  }
}
