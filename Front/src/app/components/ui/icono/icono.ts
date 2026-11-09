import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONOS, NombreIcono } from './iconos';

export type { NombreIcono } from './iconos';

/**
 * Icono de linea sobre un lienzo de 24x24. Todos comparten estilo (trazo de
 * 1.75, extremos redondeados) y heredan el color con `currentColor`, asi que se
 * tinta desde el contenedor igual que el texto. El tamaño sale de `[tamano]`.
 *
 * Los dibujos estan en iconos.ts: cada icono es una lista de figuras (caminos,
 * circulos y rectangulos) que este template recorre.
 */
@Component({
  selector: 'ui-icono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="tamano()"
      [attr.height]="tamano()"
      viewBox="0 0 24 24"
      [attr.fill]="relleno() ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @for (figura of figuras(); track $index) {
        @switch (figura.tipo) {
          @case ('camino') {
            <path [attr.d]="figura.d" />
          }
          @case ('circulo') {
            <circle
              [attr.cx]="figura.cx"
              [attr.cy]="figura.cy"
              [attr.r]="figura.r"
              [attr.fill]="figura.lleno ? 'currentColor' : null"
              [attr.stroke]="figura.lleno ? 'none' : null"
            />
          }
          @case ('rectangulo') {
            <rect
              [attr.x]="figura.x"
              [attr.y]="figura.y"
              [attr.width]="figura.ancho"
              [attr.height]="figura.alto"
              [attr.rx]="figura.radio"
            />
          }
        }
      }
    </svg>
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class Icono {
  readonly nombre = input.required<NombreIcono>();
  readonly tamano = input(20);
  /** Rellena el dibujo con el color del texto (ej. un corazon lleno). Por defecto, solo el contorno. */
  readonly relleno = input(false);

  protected readonly figuras = computed(() => ICONOS[this.nombre()]);
}
