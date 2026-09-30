import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Patente dibujada como la chapa Mercosur: fondo blanco, franja azul arriba y
 * caracteres en bloques ("AB 123 CD"). Queda blanca tambien en modo noche,
 * igual que la chapa real.
 */
@Component({
  selector: 'ui-chapa-patente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="num-tabular inline-flex flex-col overflow-hidden rounded-[4px] border border-[#cbd5e1]
             bg-white text-[13px] leading-none font-bold tracking-[0.08em] whitespace-nowrap text-[#0f172a]"
      [attr.aria-label]="'Patente ' + texto()"
    >
      <span class="h-[3px] bg-[#1d3d8f]" aria-hidden="true"></span>
      <span class="px-2 pt-[5px] pb-[6px]">{{ texto() }}</span>
    </span>
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class ChapaPatente {
  readonly patente = input.required<string>();

  /** La patente llega normalizada (sin espacios): se separa en letras y numeros. */
  protected readonly texto = computed(() => {
    const limpia = this.patente().toUpperCase().replace(/\s+/g, '');
    return limpia.match(/[A-Z]+|\d+/g)?.join(' ') ?? limpia;
  });
}
