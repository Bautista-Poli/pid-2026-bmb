import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type RellenoTarjeta = 'ninguno' | 'sm' | 'md' | 'lg';

const RELLENOS: Record<RellenoTarjeta, string> = {
  ninguno: '',
  sm: 'p-4',
  md: 'p-5 lg:px-6 lg:py-[22px]',
  lg: 'p-6',
};

/**
 * Superficie base: blanca, borde de 1px, radio 14px y sombra muy tenue.
 * `interactiva` agrega la elevacion de hover para las tarjetas que llevan a
 * otra vista (el listado de estacionamientos).
 */
@Component({
  selector: 'ui-tarjeta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="clases()">
      <ng-content />
    </div>
  `,
  host: { class: 'block' },
})
export class Tarjeta {
  readonly relleno = input<RellenoTarjeta>('md');
  readonly recortar = input(false);
  readonly interactiva = input(false);

  protected readonly clases = computed(() =>
    [
      'h-full rounded-tarjeta border border-borde bg-papel shadow-tarjeta',
      'transition-[box-shadow,border-color,transform] duration-160 ease-out',
      RELLENOS[this.relleno()],
      this.recortar() ? 'overflow-hidden' : '',
      this.interactiva() ? 'hover:-translate-y-0.5 hover:border-acento-borde hover:shadow-flotante' : '',
    ].join(' '),
  );
}
