import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Boton } from '@app/components/ui';
import { inicioSegunRol } from '@app/guards/rol.guard';
import { RegistroUsuario, RolUsuario } from '@app/models';
import { AuthService } from '@app/services/auth.service';

/** Mismos limites que valida el backend (auth.validator.js). */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

const OPCIONES_ROL: { valor: RolUsuario; titulo: string; descripcion: string }[] = [
  { valor: 'CONDUCTOR', titulo: 'Conductor', descripcion: 'Busco y reservo cocheras.' },
  { valor: 'PROPIETARIO', titulo: 'Propietario', descripcion: 'Administro un estacionamiento.' },
];

function passwordsIguales(grupo: AbstractControl): ValidationErrors | null {
  const password = grupo.get('password')?.value;
  const repetida = grupo.get('repetirPassword')?.value;
  return password && repetida && password !== repetida ? { passwordsDistintas: true } : null;
}

/** Un conductor nuevo no tiene vehiculos, y sin vehiculo no puede reservar: arranca por ahi. */
function destinoTrasRegistro(rol: RolUsuario): string {
  return rol === 'CONDUCTOR' ? '/conductor/vehiculos' : inicioSegunRol(rol);
}

/**
 * Pantalla `/registrarse` · publica
 *
 * Alta de usuario eligiendo el rol: Conductor o Propietario.
 */
@Component({
  selector: 'app-registro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Boton, NgOptimizedImage],
  templateUrl: './registro.html',
  styleUrl: './registro.css',
})
export class Registro {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly opcionesRol = OPCIONES_ROL;
  protected readonly passwordMin = PASSWORD_MIN;
  protected readonly passwordMax = PASSWORD_MAX;

  protected readonly formulario = this.fb.nonNullable.group(
    {
      rol: this.fb.nonNullable.control<RolUsuario>('CONDUCTOR'),
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      apellido: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
      telefono: ['', [Validators.maxLength(30)]],
      password: [
        '',
        [Validators.required, Validators.minLength(PASSWORD_MIN), Validators.maxLength(PASSWORD_MAX)],
      ],
      repetirPassword: ['', [Validators.required]],
    },
    { validators: passwordsIguales },
  );

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** El error de un campo se muestra recien cuando el usuario ya paso por el. */
  protected invalido(campo: string): boolean {
    const control = this.formulario.get(campo);
    return Boolean(control?.invalid && control.touched);
  }

  protected passwordsDistintas(): boolean {
    return (
      this.formulario.controls.repetirPassword.touched &&
      this.formulario.hasError('passwordsDistintas')
    );
  }

  /** `POST /api/auth/register`: crea la cuenta y deja la sesion iniciada. */
  protected enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    const datos: RegistroUsuario = {
      nombre: valores.nombre.trim(),
      apellido: valores.apellido.trim(),
      email: valores.email.trim(),
      telefono: valores.telefono.trim() || undefined,
      password: valores.password,
      rol: valores.rol,
    };

    this.enviando.set(true);
    this.error.set(null);

    this.auth.registro(datos).subscribe({
      next: (usuario) => {
        this.enviando.set(false);
        void this.router.navigateByUrl(destinoTrasRegistro(usuario.rol));
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
