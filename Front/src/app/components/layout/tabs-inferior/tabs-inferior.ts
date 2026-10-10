import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ItemNavegacion } from '@app/components/layout';
import { Icono } from '@app/components/ui';
import { EstadoNavegacion } from '@app/services/estado-navegacion';

/**
 * Tab bar mobile: grilla de columnas iguales, activo con fondo acento. Mientras
 * la pantalla de la pestaña tocada se carga, su icono se cambia por un spinner.
 */
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
              [attr.aria-busy]="cargando(item.ruta) || null"
            >
              @if (cargando(item.ruta)) {
                <span
                  class="size-[21px] animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                ></span>
              } @else {
                <ui-icono [nombre]="item.icono" [tamano]="21" />
              }
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

  private readonly navegacion = inject(EstadoNavegacion);

  /** La pestaña esta cargando si el destino pendiente es su ruta (o una subruta). */
  protected cargando(ruta: string): boolean {
    const destino = this.navegacion.destino();
    return destino !== null && (destino === ruta || destino.startsWith(ruta + '/'));
  }
}
