import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { BarraLateral, ItemNavegacion, MenuUsuario, TabsInferior } from '@app/components/layout';
import { BotonTema, Logo } from '@app/components/ui';
import { inicioSegunRol } from '@app/guards/rol.guard';
import { RolUsuario } from '@app/models';
import { AuthService } from '@app/services/auth.service';

/** Navegacion de cada rol. El guard ya garantizo que el rol corresponde. */
const NAVEGACION: Record<RolUsuario, ItemNavegacion[]> = {
  CONDUCTOR: [
    { ruta: '/conductor/explorar', etiqueta: 'Explorar', icono: 'explorar' },
    { ruta: '/conductor/mis-reservas', etiqueta: 'Mis reservas', icono: 'reservas' },
    { ruta: '/conductor/vehiculos', etiqueta: 'Vehículos', icono: 'auto' },
  ],
  PROPIETARIO: [
    { ruta: '/propietario/tablero', etiqueta: 'Panel', icono: 'tablero' },
    { ruta: '/propietario/reservas', etiqueta: 'Reservas', icono: 'reservas' },
    { ruta: '/propietario/estacionamientos', etiqueta: 'Estacionamientos', icono: 'estacionamiento' },
  ],
};

/**
 * Shell de la app: tab bar abajo en mobile, sidebar de 238px desde 1024px.
 * El canvas de desktop limita el contenido a 940px, como en el diseno.
 */
@Component({
  selector: 'app-layout-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, TabsInferior, BarraLateral, BotonTema, Logo, MenuUsuario],
  templateUrl: './layout-app.html',
})
export class LayoutApp {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly usuario = this.auth.usuario;
  protected readonly items = computed(() => {
    const rol = this.auth.rol();
    return rol ? NAVEGACION[rol] : [];
  });

  /** Perfil al que se puede pasar; `null` si el usuario tiene uno solo. */
  protected readonly rolAlternativo = computed<RolUsuario | null>(() => {
    const usuario = this.usuario();
    return usuario?.roles.find((rol) => rol !== usuario.rol) ?? null;
  });


  protected readonly cambiandoRol = signal(false);

  protected cambiarRol(): void {
    const rol = this.rolAlternativo();
    if (!rol || this.cambiandoRol()) return;

    this.cambiandoRol.set(true);
    this.auth.cambiarRol(rol).subscribe({
      next: (usuario) => {
        this.cambiandoRol.set(false);
        void this.router.navigateByUrl(inicioSegunRol(usuario.rol));
      },
      error: () => this.cambiandoRol.set(false),
    });
  }

  protected salir(): void {
    this.auth.logout().subscribe();
    void this.router.navigate(['/ingresar']);
  }
}
