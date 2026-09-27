import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { RolUsuario, Usuario } from '@app/models';
// MenuUsuario se importa por ruta directa, no por el barrel: el barrel importa
// a este archivo y el ciclo rompe la resolucion de metadata (NG0919).
import type { ItemNavegacion } from '../navegacion.model';
import { MenuUsuario } from '../menu-usuario/menu-usuario';
import { BotonTema, Icono, Logo } from '@app/components/ui';

/** Nav lateral de 238px que reemplaza a la tab bar en >= 1024px. */
@Component({
  selector: 'app-barra-lateral',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, BotonTema, Icono, Logo, MenuUsuario],
  templateUrl: './barra-lateral.html',
  host: { class: 'block h-full' },
})
export class BarraLateral {
  readonly items = input.required<ItemNavegacion[]>();
  readonly usuario = input<Usuario | null>(null);
  /** Otro perfil del usuario; `null` si tiene uno solo. */
  readonly rolAlternativo = input<RolUsuario | null>(null);
  readonly cambiandoRol = input(false);

  readonly salir = output<void>();
  readonly cambiarRol = output<void>();
}
