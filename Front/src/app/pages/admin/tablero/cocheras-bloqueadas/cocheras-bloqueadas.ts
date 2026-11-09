import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import { EstadisticasAdmin } from '@app/models';

/**
 * "Cocheras bloqueadas" del tablero de admin (tablero.ts): autos que se pasaron
 * de su horario y lo que provocaron (reasignaciones, sin cochera, cancelaciones),
 * en total y por estacionamiento.
 */
@Component({
  selector: 'app-cocheras-bloqueadas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tarjeta],
  templateUrl: './cocheras-bloqueadas.html',
  styleUrls: ['../compartido.css', './cocheras-bloqueadas.css'],
  host: { style: 'display: contents' },
})
export class CocherasBloqueadas {
  readonly datos = input.required<EstadisticasAdmin>();

  protected readonly totalBloqueos = computed(() => {
    const b = this.datos().conflictos.bloqueos;
    return b.reasignadas + b.canceladas + b.autosExcedidos + b.sinCochera;
  });
}
