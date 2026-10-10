import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Patente dibujada como la chapa de cada epoca. La Mercosur tiene fondo blanco,
 * franja azul arriba y caracteres en bloques ("AB 123 CD"); la vieja argentina
 * (ABC 123 en autos, 123 ABC en motos) es negra con letras blancas y sin franja.
 * Ambas quedan iguales en modo noche, como las chapas reales.
 */
@Component({
  selector: 'ui-chapa-patente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="num-tabular inline-flex flex-col overflow-hidden rounded-[4px] border
             text-[13px] leading-none font-bold tracking-[0.08em] whitespace-nowrap"
      [class]="esVieja() ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white' : 'border-[#cbd5e1] bg-white text-[#0f172a]'"
      [attr.aria-label]="'Patente ' + texto()"
    >
      @if (!esVieja()) {
        <span class="h-[3px] bg-[#1d3d8f]" aria-hidden="true"></span>
      }
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

  /** Formato viejo argentino: ABC123 (auto) o 123ABC (moto), sin el "AB 123 CD" de Mercosur. */
  protected readonly esVieja = computed(() =>
    /^([A-Z]{3}\d{3}|\d{3}[A-Z]{3})$/.test(this.patente().toUpperCase().replace(/\s+/g, '')),
  );
}
