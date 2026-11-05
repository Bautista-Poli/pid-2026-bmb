import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

/**
 * Lo que el back cuenta del entorno (`GET /api/entorno`). Hoy, si corre en
 * modo offline (OFFLINE=true, ver docs/offline.md): ahi el mapa sale de un
 * archivo local y no se consultan servicios de afuera (Georef, Photon).
 * Se carga una vez al arrancar (app.config.ts).
 */
@Injectable({ providedIn: 'root' })
export class EntornoService {
  private readonly http = inject(HttpClient);
  private readonly enModoOffline = signal(false);

  /** true con el back en modo offline. */
  readonly offline = this.enModoOffline.asReadonly();

  /** Nunca lanza: si el back no responde, se sigue como online. */
  cargar(): Observable<void> {
    return this.http.get<{ offline: boolean }>('/entorno').pipe(
      map(({ offline }) => this.enModoOffline.set(offline === true)),
      catchError(() => of(undefined)),
    );
  }
}
