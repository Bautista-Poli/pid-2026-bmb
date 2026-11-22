import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ETIQUETA_MODALIDAD, ReservaDetallada, TURNOS } from '@app/models';

/** Lo que cuesta la reserva y su modalidad; si es por abono, el turno. */
@Component({
  selector: 'app-precio-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = reserva();
    <p class="flex items-baseline gap-2">
      @if (r.abono; as abono) {
        <span class="text-[15px] font-semibold text-tinta">Abono</span>
        <span class="text-[12.5px] text-plomo">Turno {{ turnos[abono.turno].etiqueta.toLowerCase() }}</span>
      } @else {
        <span class="num-tabular text-[17px] font-semibold text-tinta">
          $ {{ r.precioTotal.toLocaleString('es-AR') }}
        </span>
        <span class="text-[12.5px] text-plomo">{{ etiquetaModalidad[r.modalidad] }}</span>
      }
    </p>
  `,
})
export class PrecioReserva {
  readonly reserva = input.required<ReservaDetallada>();

  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;
  protected readonly turnos = TURNOS;
}
