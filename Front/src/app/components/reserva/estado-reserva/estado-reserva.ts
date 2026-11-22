import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Etiqueta, TonoEtiqueta } from '@app/components/ui';
import { EstadoReserva as Estado, esExpirada, etiquetaReserva, Reserva } from '@app/models';

const TONO_ESTADO: Record<Estado, TonoEtiqueta> = {
  PENDIENTE: 'aviso',
  CONFIRMADA: 'acento',
  ACTIVA: 'exito',
  FINALIZADA: 'neutro',
  CANCELADA: 'peligro',
  NO_SHOW: 'peligro',
};

/**
 * Etiqueta con el estado de una reserva. Sabe sola el texto y el color: una
 * expirada (no se confirmo a tiempo) va en amarillo, distinta de una
 * cancelacion, y el texto de una cancelada depende de quien mira (`vista`).
 *
 *   <app-estado-reserva [reserva]="reserva" vista="CONDUCTOR" />
 */
@Component({
  selector: 'app-estado-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Etiqueta],
  template: `
    <ui-etiqueta [tono]="tono()">
      @if (reserva().estado === 'ACTIVA') {
        <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
      }
      {{ etiquetaEstado() }}
    </ui-etiqueta>
  `,
})
export class EstadoReserva {
  readonly reserva = input.required<Reserva>();
  /** Quien mira: al conductor no se le dice "cancelada por el conductor". */
  readonly vista = input<'CONDUCTOR' | 'PROPIETARIO'>('PROPIETARIO');

  protected readonly etiquetaEstado = computed(() => etiquetaReserva(this.reserva(), this.vista()));
  protected readonly tono = computed(() =>
    esExpirada(this.reserva()) ? 'aviso' : TONO_ESTADO[this.reserva().estado],
  );
}
