import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tarjeta } from '@app/components/ui';
import { EstadisticasAdmin } from '@app/models';
import { haceCuanto } from '@app/utils/tiempo.util';

/**
 * "Estacionamientos por aprobar" del tablero de admin (tablero.ts): cuantos
 * esperan, cuanto hace que espera el mas viejo y los primeros de la cola.
 */
@Component({
  selector: 'app-pendientes-aprobacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Tarjeta],
  templateUrl: './pendientes-aprobacion.html',
  styleUrls: ['../compartido.css', './pendientes-aprobacion.css'],
  host: { style: 'display: contents' },
})
export class PendientesAprobacion {
  readonly datos = input.required<EstadisticasAdmin>();

  protected readonly haceCuanto = haceCuanto;
}
