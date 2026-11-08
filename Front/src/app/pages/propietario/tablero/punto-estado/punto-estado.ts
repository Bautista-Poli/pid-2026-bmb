// Punto de color que indica un estado (libre, ocupada, …) al lado de un texto.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type TonoPunto = 'acento' | 'baja' | 'ocupada' | 'reservada';

/** El halo de 3px separa el punto del fondo sin agrandar los 6px del diseno. */
const TONOS: Record<TonoPunto, string> = {
  acento: 'bg-acento ring-acento/20',
  baja: 'bg-baja ring-baja/20',
  ocupada: 'bg-ocupada ring-ocupada/20',
  reservada: 'bg-reservada ring-reservada/20',
};

/** Punto de estado de 6px: disponibilidad de un lote y estado de una cochera. */
@Component({
  selector: 'ui-punto-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="block size-1.5 rounded-full ring-[3px]" [class]="clase()" aria-hidden="true"></span>
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class PuntoEstado {
  readonly tono = input<TonoPunto>('acento');

  protected readonly clase = computed(() => TONOS[this.tono()]);
}
