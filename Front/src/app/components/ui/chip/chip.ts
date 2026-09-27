import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** Chip de filtro: 12.5px/500, radio 8px, activo con fondo acento. */
@Component({
  selector: 'ui-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" [class]="clases()" [attr.aria-pressed]="activo()" (click)="alternar.emit()">
      <ng-content />
    </button>
  `,
  styleUrl: './chip.css',
})
export class Chip {
  readonly activo = input(false);

  readonly alternar = output<void>();

  protected readonly clases = computed(() =>
    [
      'shrink-0 rounded-boton border px-3.5 py-[9px] text-[12.5px] font-medium whitespace-nowrap',
      'transition-[background-color,border-color,box-shadow,color] duration-160 ease-out',
      this.activo()
        ? 'border-acento bg-acento text-sobre-acento shadow-elevada'
        : 'border-borde bg-papel text-plomo shadow-tarjeta hover:border-acento-borde hover:bg-acento-suave hover:text-acento-fuerte',
    ].join(' '),
  );
}
