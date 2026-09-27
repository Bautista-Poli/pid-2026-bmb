import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { TemaService } from '@app/services/tema.service';
import { Icono } from '../icono/icono';

/**
 * Interruptor de modo dia / modo noche.
 *
 * Muestra el modo al que se va a pasar: luna cuando estas en claro, sol cuando
 * estas en oscuro. Habla directo con `TemaService` porque el tema es estado
 * global, no algo que le corresponda pasar a la pantalla que lo contiene.
 */
@Component({
  selector: 'ui-boton-tema',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  template: `
    <button
      type="button"
      class="grid size-7 shrink-0 place-items-center rounded-boton text-plomo
             transition-colors duration-160 ease-out hover:bg-borde-sutil hover:text-tinta"
      [attr.aria-label]="etiqueta()"
      [attr.title]="etiqueta()"
      (click)="alternar()"
    >
      <ui-icono [nombre]="esOscuro() ? 'sol' : 'luna'" [tamano]="16" />
    </button>
  `,
  host: { class: 'inline-flex' },
})
export class BotonTema {
  private readonly tema = inject(TemaService);

  protected readonly esOscuro = this.tema.esOscuro;
  protected readonly etiqueta = computed(() =>
    this.esOscuro() ? 'Cambiar a modo día' : 'Cambiar a modo noche',
  );

  protected alternar(): void {
    this.tema.alternar();
  }
}
