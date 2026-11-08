import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Cochera, ETIQUETA_ESTADO_COCHERA, EstadoCochera } from '@app/models';
import { PuntoEstado, TonoPunto } from '../punto-estado/punto-estado';

/** Color del punto en la cuadricula del propietario. */
const TONO_ESTADO_COCHERA: Record<EstadoCochera, TonoPunto> = {
  LIBRE: 'acento',
  OCUPADA: 'ocupada',
  RESERVADA: 'reservada',
  INACTIVA: 'reservada',
};

/** Celda de la cuadricula de ocupacion: identificador sobre punto de estado. */
@Component({
  selector: 'app-celda-cochera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PuntoEstado],
  template: `
    <button
      type="button"
      class="celda"
      [class.celda--activa]="seleccionada()"
      [attr.aria-label]="cochera().identificador + ': ' + etiqueta[cochera().estado]"
      (click)="elegida.emit(cochera())"
    >
      <span class="num-tabular text-[14px] font-semibold text-tinta">
        {{ cochera().identificador }}
      </span>
      <ui-punto-estado [tono]="tono()" />
    </button>
  `,
  styleUrl: './celda-cochera.css',
})
export class CeldaCochera {
  readonly cochera = input.required<Cochera>();
  readonly seleccionada = input(false);

  readonly elegida = output<Cochera>();

  protected readonly etiqueta = ETIQUETA_ESTADO_COCHERA;
  protected readonly tono = computed(() => TONO_ESTADO_COCHERA[this.cochera().estado]);
}
