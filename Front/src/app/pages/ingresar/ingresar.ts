import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Boton } from '@app/components/ui';
import { inicioSegunRol } from '@app/guards/rol.guard';
import { Credenciales } from '@app/models';
import { AuthService } from '@app/services/auth.service';

/**
 * Pantalla `/ingresar` · publica
 *
 * Ingreso a la app: el rol de la sesion define que rama de rutas ve el usuario.
 */
@Component({
  selector: 'app-ingresar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Boton, NgOptimizedImage],
  templateUrl: './ingresar.html',
})
export class Ingresar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly formulario = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.ingresar(this.formulario.getRawValue());
  }

  private ingresar(credenciales: Credenciales): void {
    this.enviando.set(true);
    this.error.set(null);

    this.auth.login(credenciales).subscribe({
      next: (usuario) => {
        this.enviando.set(false);
        void this.router.navigateByUrl(this.destino() ?? inicioSegunRol(usuario.rol));
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  /** Ruta a la que el usuario queria entrar antes de que actuara el guard. */
  private destino(): string | null {
    const params = new URLSearchParams(location.search);
    return params.get('redirigir');
  }
}
