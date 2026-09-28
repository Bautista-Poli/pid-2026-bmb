import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { RolUsuario, Usuario } from '@app/models';
// MenuUsuario se importa por ruta directa, no por el barrel: el barrel importa
// a este archivo y el ciclo rompe la resolucion de metadata (NG0919).
import type { ItemNavegacion } from '../navegacion.model';
import { MenuUsuario } from '../menu-usuario/menu-usuario';
import { BotonTema, Icono, Logo } from '@app/components/ui';

/**
 * Nav superior de 64px que reemplaza a la tab bar en >= 1024px: marca a la
 * izquierda, secciones al lado (la activa subrayada) y, a la derecha, el tema y
 * el menu del usuario.
 */
@Component({
  selector: 'app-barra-superior',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, BotonTema, Icono, Logo, MenuUsuario],
  template: `
    <header class="flex h-16 items-stretch gap-10 border-b border-borde bg-papel px-8">
      <a class="flex items-center" [routerLink]="items()[0]?.ruta ?? '/'" aria-label="Inicio">
        <ui-logo [tamano]="30" />
      </a>

      <nav class="flex items-stretch">
        <ul class="flex items-stretch gap-1">
          @for (item of items(); track item.ruta) {
            <li class="flex">
              <a
                class="relative flex items-center gap-2.5 px-4 text-[13.5px] font-medium text-plomo
                       transition-colors duration-160 ease-out hover:text-tinta
                       after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-full
                       after:bg-transparent after:transition-colors after:duration-160"
                [routerLink]="item.ruta"
                routerLinkActive="!text-acento font-semibold after:!bg-acento"
                ariaCurrentWhenActive="page"
              >
                <ui-icono [nombre]="item.icono" [tamano]="19" />
                {{ item.etiqueta }}
              </a>
            </li>
          }
        </ul>
      </nav>

      @if (usuario(); as datos) {
        <div class="ml-auto flex items-center gap-2">
          <ui-boton-tema />
          <app-menu-usuario
            [compacto]="true"
            direccion="abajo"
            [usuario]="datos"
            [rolAlternativo]="rolAlternativo()"
            [cambiandoRol]="cambiandoRol()"
            (cambiarRol)="cambiarRol.emit()"
            (salir)="salir.emit()"
          />
        </div>
      }
    </header>
  `,
  host: { class: 'block' },
})
export class BarraSuperior {
  readonly items = input.required<ItemNavegacion[]>();
  readonly usuario = input<Usuario | null>(null);
  /** Otro perfil del usuario; `null` si tiene uno solo. */
  readonly rolAlternativo = input<RolUsuario | null>(null);
  readonly cambiandoRol = input(false);

  readonly salir = output<void>();
  readonly cambiarRol = output<void>();
}
