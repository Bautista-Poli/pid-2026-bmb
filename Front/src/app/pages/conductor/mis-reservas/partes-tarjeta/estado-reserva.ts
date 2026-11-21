import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Etiqueta, TonoEtiqueta } from '@app/components/ui';
import { EstadoReserva as Estado, esExpirada, etiquetaReserva, ReservaDetallada } from '@app/models';

const TONO_ESTADO: Record<Estado, TonoEtiqueta> = {
  PENDIENTE: 'aviso',
  CONFIRMADA: 'acento',
  ACTIVA: 'exito',
  FINALIZADA: 'neutro',
  CANCELADA: 'peligro',
  NO_SHOW: 'peligro',
};

/** Etiqueta con el estado de una reserva, como lo ve el conductor. */
@Component({
  selector: 'app-estado-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Etiqueta],
  template: `
    @let r = reserva();
    <ui-etiqueta [tono]="tono()">
      @if (r.estado === 'ACTIVA') {
        <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
      }
      {{ etiquetaEstado() }}
    </ui-etiqueta>
  `,
})
export class EstadoReserva {
  readonly reserva = input.required<ReservaDetallada>();

  protected readonly etiquetaEstado = computed(() => etiquetaReserva(this.reserva(), 'CONDUCTOR'));
  protected readonly tono = computed(() =>
    esExpirada(this.reserva()) ? 'aviso' : TONO_ESTADO[this.reserva().estado],
  );
}
