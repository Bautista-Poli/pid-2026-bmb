import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

import { Icono } from '../icono/icono';

/**
 * Boton de ojo para mostrar u ocultar lo que se tipea en un campo de
 * contraseña. Va al lado del input, dentro de un contenedor `relative`, y el
 * input necesita `pr-11` para que el texto no quede debajo del boton:
 *
 *   <div class="relative">
 *     <input #clave type="password" class="w-full pr-11" ... />
 *     <ui-ver-password [campo]="clave" />
 *   </div>
 */
@Component({
  selector: 'ui-ver-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  template: `
    <button
      type="button"
      class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-control
             text-humo transition-colors duration-160 ease-out hover:text-tinta
             focus-visible:text-acento focus-visible:outline-none"
      [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
      [attr.aria-pressed]="visible()"
      (click)="alternar()"
    >
      <ui-icono [nombre]="visible() ? 'ojo-tachado' : 'ojo'" [tamano]="18" />
    </button>
  `,
})
export class VerPassword {
  readonly campo = input.required<HTMLInputElement>();

  protected readonly visible = signal(false);

  protected alternar(): void {
    this.visible.update((v) => !v);
    this.campo().type = this.visible() ? 'text' : 'password';
  }
}
