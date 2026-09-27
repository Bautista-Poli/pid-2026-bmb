import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro';
export type TamanoBoton = 'sm' | 'md';

const VARIANTES: Record<VarianteBoton, string> = {
  // Primario: acento solido con elevacion; es la unica accion de cada vista.
  primario:
    'border border-acento bg-acento text-sobre-acento shadow-elevada hover:border-acento-fuerte hover:bg-acento-fuerte',
  // Secundario: papel + borde. Al hover se tinta del acento en lugar de gris,
  // asi la accion se lee como accionable y no como deshabilitada.
  secundario:
    'border border-borde bg-papel text-tinta shadow-tarjeta hover:border-acento-borde hover:bg-acento-suave hover:text-acento-fuerte',
  fantasma: 'border border-transparent bg-transparent text-plomo hover:bg-borde-sutil hover:text-tinta',
  peligro:
    'border border-borde bg-papel text-ocupada shadow-tarjeta hover:border-ocupada/40 hover:bg-ocupada/5',
};

const TAMANOS: Record<TamanoBoton, string> = {
  sm: 'px-[18px] py-[9px] text-[13px]',
  md: 'px-4 py-[11px] text-[13px]',
};

/** Boton base: unifica radios, foco, elevacion y estados de todos los controles. */
@Component({
  selector: 'ui-boton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="tipo()"
      [disabled]="deshabilitado() || cargando()"
      [class]="clases()"
      (click)="presionado.emit($event)"
    >
      @if (cargando()) {
        <span
          class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        ></span>
      }
      <ng-content />
    </button>
  `,
  styleUrl: './boton.css',
})
export class Boton {
  readonly variante = input<VarianteBoton>('secundario');
  readonly tamano = input<TamanoBoton>('md');
  readonly tipo = input<'button' | 'submit'>('button');
  readonly deshabilitado = input(false);
  readonly cargando = input(false);
  readonly bloque = input(false);

  readonly presionado = output<MouseEvent>();

  protected readonly clases = computed(() =>
    [
      'inline-flex items-center justify-center gap-2 rounded-boton font-semibold',
      // Micro-transiciones: 160ms sobre color, borde y sombra (el hundido de
      // 1px al presionar lo pone boton.css).
      'transition-[background-color,border-color,box-shadow,color] duration-160 ease-out',
      'disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none',
      VARIANTES[this.variante()],
      TAMANOS[this.tamano()],
      this.bloque() ? 'w-full' : '',
    ].join(' '),
  );
}
