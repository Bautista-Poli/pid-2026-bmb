import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { filter } from 'rxjs';

/**
 * Ruta a la que el usuario esta yendo mientras el router la resuelve. Con la
 * red lenta la navegacion tarda (sobre todo al bajar el chunk de la pantalla),
 * y sin esta senal parece que la app no tomo el toque. `null` si no navega.
 */
@Injectable({ providedIn: 'root' })
export class EstadoNavegacion {
  private readonly router = inject(Router);

  readonly destino = signal<string | null>(null);

  constructor() {
    this.router.events
      .pipe(
        filter(
          (evento) =>
            evento instanceof NavigationStart ||
            evento instanceof NavigationEnd ||
            evento instanceof NavigationCancel ||
            evento instanceof NavigationError,
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((evento) => {
        this.destino.set(evento instanceof NavigationStart ? evento.url : null);
      });
  }
}
