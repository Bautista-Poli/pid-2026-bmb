import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReservaDetallada } from '@app/models';

/**
 * Invitacion a calificar la ultima estadia, arriba de Mis reservas.
 *
 * Se arregla sola: de las reservas pasadas elige la mas reciente que todavia
 * se puede calificar (entro y salio hace menos de 7 dias) y lleva a
 * calificarla. Si no hay ninguna, no pinta nada.
 *
 *   <app-invitacion-calificar [reservas]="pasadas()" />
 */
@Component({
  selector: 'app-invitacion-calificar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './invitacion-calificar.html',
  styleUrl: './invitacion-calificar.css',
  // Sin caja propia: si no hay nada para calificar, no ocupa lugar en la columna.
  host: { style: 'display: contents' },
})
export class InvitacionCalificar {
  /** Reservas pasadas, de la mas reciente a la mas vieja. */
  readonly reservas = input.required<ReservaDetallada[]>();

  protected readonly porCalificar = computed(() => this.reservas().find((reserva) => reserva.calificable) ?? null);
}
