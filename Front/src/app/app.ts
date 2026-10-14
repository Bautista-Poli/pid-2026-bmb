import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EstadoNavegacion } from '@app/services/estado-navegacion';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    @if (navegacion.destino() !== null) {
      <div class="progreso-navegacion" role="progressbar" aria-label="Cargando pantalla"></div>
    }
    <router-outlet />
  `,
})
export class App {
  protected readonly navegacion = inject(EstadoNavegacion);
}
