import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icono } from '@app/components/ui';
import { ETIQUETA_ROL, iniciales, nombreCorto, RolUsuario, Usuario } from '@app/models';

const PERFIL_SEGUN_ROL: Record<RolUsuario, string> = {
  CONDUCTOR: '/conductor/perfil',
  PROPIETARIO: '/propietario/perfil',
};

/**
 * Identidad del usuario y lo que se puede hacer con ella: entrar al perfil,
 * cambiar de perfil activo y salir.
 *
 * Vive fuera de la navegacion a proposito. El menu lista lugares de la app;
 * esto es "vos", y se despliega tocandote a vos mismo.
 *
 * `compacto` deja solo el avatar (barra mobile) y `direccion` dice para donde
 * abrir: hacia arriba en la barra lateral, hacia abajo en el header.
 */
@Component({
  selector: 'app-menu-usuario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icono],
  templateUrl: './menu-usuario.html',
  host: {
    class: 'relative block',
    '(document:click)': 'cerrarSiEsAfuera($event)',
    '(document:keydown.escape)': 'cerrarYVolverAlBoton()',
  },
})
export class MenuUsuario {
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly usuario = input.required<Usuario>();
  readonly rolAlternativo = input<RolUsuario | null>(null);
  readonly cambiandoRol = input(false);
  readonly compacto = input(false);
  readonly direccion = input<'arriba' | 'abajo'>('arriba');

  readonly cambiarRol = output<void>();
  readonly salir = output<void>();

  protected readonly abierto = signal(false);

  protected readonly inicial = computed(() => iniciales(this.usuario()));
  protected readonly nombre = computed(() => nombreCorto(this.usuario()));
  protected readonly rol = computed(() => ETIQUETA_ROL[this.usuario().rol]);
  protected readonly rutaPerfil = computed(() => PERFIL_SEGUN_ROL[this.usuario().rol]);

  protected readonly etiquetaRolAlternativo = computed(() => {
    const rol = this.rolAlternativo();
    return rol ? ETIQUETA_ROL[rol] : '';
  });

  protected alternar(): void {
    this.abierto.update((estaba) => !estaba);
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  /** Escape devuelve el foco al boton: si no, queda flotando en la nada. */
  protected cerrarYVolverAlBoton(): void {
    if (!this.abierto()) return;
    this.cerrar();
    this.elemento.nativeElement.querySelector<HTMLButtonElement>('[data-disparador]')?.focus();
  }

  protected cerrarSiEsAfuera(evento: Event): void {
    if (!this.abierto()) return;
    if (this.elemento.nativeElement.contains(evento.target as Node)) return;
    this.cerrar();
  }

  protected pedirCambioDeRol(): void {
    this.cerrar();
    this.cambiarRol.emit();
  }

  protected pedirSalida(): void {
    this.cerrar();
    this.salir.emit();
  }
}
