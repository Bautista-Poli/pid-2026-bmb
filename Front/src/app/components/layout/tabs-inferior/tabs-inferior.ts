import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ItemNavegacion } from '@app/components/layout';
import { Icono } from '@app/components/ui';

/** Tab bar mobile: grilla de columnas iguales, activo con fondo acento. */
@Component({
  selector: 'app-tabs-inferior',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Icono],
  template: `
    <nav
      class="border-t border-borde bg-papel/85 px-4 pt-2.5 pb-[22px] backdrop-blur-md"
      style="padding-bottom: max(22px, env(safe-area-inset-bottom))"
    >
      <ul class="grid gap-1.5" [style.grid-template-columns]="'repeat(' + items().length + ', 1fr)'">
        @for (item of items(); track item.ruta) {
          <li>
            <a
              class="flex flex-col items-center gap-1 rounded-boton px-1.5 py-2 text-center
                     text-[11px] font-semibold text-plomo
                     transition-[background-color,box-shadow,color] duration-160 ease-out"
              [routerLink]="item.ruta"
              routerLinkActive="bg-acento text-sobre-acento shadow-elevada"
            >
              <ui-icono [nombre]="item.icono" [tamano]="21" />
              {{ item.etiqueta }}
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  host: { class: 'block' },
})
export class TabsInferior {
  readonly items = input.required<ItemNavegacion[]>();
}
