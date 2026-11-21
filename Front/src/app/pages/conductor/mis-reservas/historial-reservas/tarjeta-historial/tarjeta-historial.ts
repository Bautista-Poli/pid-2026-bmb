import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '@app/components/ui';
import { ReservaDetallada, TURNOS } from '@app/models';
import { AvisoReasignacion } from '../../partes-tarjeta/aviso-reasignacion';
import { EstadoReserva } from '../../partes-tarjeta/estado-reserva';
import { FechaReserva } from '../../partes-tarjeta/fecha-reserva';

/**
 * Fila de una reserva en el historial del conductor: fecha, estacionamiento,
 * precio y estado. Si ya la uso, tambien el acceso a calificarla (o su nota).
 */
@Component({
  selector: 'app-tarjeta-historial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icono, EstadoReserva, AvisoReasignacion, FechaReserva],
  templateUrl: './tarjeta-historial.html',
  host: { class: 'block' },
})
export class TarjetaHistorial {
  readonly reserva = input.required<ReservaDetallada>();

  protected readonly turnos = TURNOS;

  protected readonly cruzaMedianoche = computed(
    () => this.reserva().fechaHasta !== this.reserva().fecha,
  );
}
