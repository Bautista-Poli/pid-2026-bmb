import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boton, EstadoVacio } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { TarjetaProxima } from './tarjeta-proxima/tarjeta-proxima';

/**
 * Pestaña "Próximas" de Mis reservas: las reservas pendientes o confirmadas que
 * todavia no empezaron, de la mas cercana a la mas lejana. Cancelar lo hace el
 * boton de cada tarjeta (cancelar-reserva); la pestaña avisa cual se cancelo.
 */
@Component({
  selector: 'app-reservas-proximas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TarjetaProxima, EstadoVacio, Boton, RouterLink],
  templateUrl: './reservas-proximas.html',
  styleUrl: './reservas-proximas.css',
})
export class ReservasProximas {
  /** Reservas que todavia no empezaron, ya ordenadas de la mas cercana a la mas lejana. */
  readonly reservas = input.required<ReservaDetallada[]>();

  /** La reserva ya se cancelo en el back: la pantalla avisa y recarga la lista. */
  readonly cancelada = output<ReservaDetallada>();
}
