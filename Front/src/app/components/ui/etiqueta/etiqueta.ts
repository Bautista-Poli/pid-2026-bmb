// Etiqueta de color (badge) para estados: el tono adelanta el estado antes de leerlo.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type TonoEtiqueta = 'neutro' | 'acento' | 'exito' | 'aviso' | 'peligro';

/**
 * El handoff dejaba todos los badges en gris. Diferenciarlos por tono hace que
 * el estado de una reserva se lea sin tener que leer la palabra.
 */
const TONOS: Record<TonoEtiqueta, string> = {
  neutro: 'border-borde bg-papel text-plomo',
  acento: 'border-acento-borde bg-acento-suave text-acento-fuerte',
  exito: 'border-exito/25 bg-exito-suave text-exito',
  aviso: 'border-baja/25 bg-baja/8 text-baja',
  peligro: 'border-ocupada/25 bg-ocupada/8 text-ocupada',
};

/** Badge de metadatos y estados: 11px, borde 1px, radio 6px. */
@Component({
  selector: 'ui-etiqueta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-etiqueta border px-[9px] py-1 text-[11px] font-medium"
      [class]="clases()"
    >
      <ng-content />
    </span>
  `,
  host: { class: 'inline-flex' },
})
export class Etiqueta {
  readonly tono = input<TonoEtiqueta>('neutro');

  protected readonly clases = computed(() => TONOS[this.tono()]);
}
