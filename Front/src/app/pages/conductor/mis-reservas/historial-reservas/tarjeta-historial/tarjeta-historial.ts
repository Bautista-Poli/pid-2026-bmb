import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EstadoReserva } from '@app/components/reserva';
import { Icono } from '@app/components/ui';
import { ReservaDetallada, TURNOS, cruzaMedianoche, formatearNota, reservaSinUsar } from '@app/models';
import { AvisoReasignacion } from '../../partes-tarjeta/aviso-reasignacion';
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

  /** "$ 6.000", o "Abono · Turno mañana" si se reservo con un abono. */
  protected readonly precio = computed(() => {
    const { abono, precioTotal } = this.reserva();
    return abono
      ? `Abono · Turno ${TURNOS[abono.turno].etiqueta.toLowerCase()}`
      : `$ ${precioTotal.toLocaleString('es-AR')}`;
  });

  /** La nota que ya le puso ("4,5"), o null si todavia no la califico. */
  protected readonly nota = computed(() => {
    const promedio = this.reserva().calificacionPromedio;
    return promedio == null ? null : formatearNota(promedio);
  });

  /** No se uso (cancelada, expirada o ausente): el precio va tachado. */
  protected readonly sinUsar = computed(() => reservaSinUsar(this.reserva()));

  protected readonly cruzaMedianoche = computed(() => cruzaMedianoche(this.reserva()));
}
