import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Boton, Icono, Modal, NombreIcono, Tarjeta } from '@app/components/ui';
import { inicioSegunRol } from '@app/guards/rol.guard';
import { CambiosPerfil, ETIQUETA_ROL, RolUsuario } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { PreferenciaTema, TemaService } from '@app/services/tema.service';

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

const PERFILES: { rol: RolUsuario; control: 'conductor' | 'propietario'; descripcion: string }[] = [
  { rol: 'CONDUCTOR', control: 'conductor', descripcion: 'Buscar y reservar cocheras.' },
  { rol: 'PROPIETARIO', control: 'propietario', descripcion: 'Administrar estacionamientos.' },
];

const TEMAS: { valor: PreferenciaTema; etiqueta: string; icono: NombreIcono }[] = [
  { valor: 'claro', etiqueta: 'Día', icono: 'sol' },
  { valor: 'oscuro', etiqueta: 'Noche', icono: 'luna' },
  { valor: 'sistema', etiqueta: 'Automático', icono: 'sistema' },
];

function alMenosUnPerfil(grupo: AbstractControl): ValidationErrors | null {
  const { conductor, propietario } = grupo.value;
  return conductor || propietario ? null : { sinPerfiles: true };
}

/** El error de un campo se muestra recien cuando el usuario ya paso por el. */
function esInvalido(control: AbstractControl | null): boolean {
  return Boolean(control?.invalid && control.touched);
}

function passwordsIguales(grupo: AbstractControl): ValidationErrors | null {
  const { password, repetirPassword } = grupo.value;
  return password && repetirPassword && password !== repetirPassword
    ? { passwordsDistintas: true }
    : null;
}

/**
 * Pantalla `/conductor/perfil` y `/propietario/perfil`
 *
 * Datos de la cuenta, perfiles habilitados, cambio de contrasena y baja.
 */
@Component({
  selector: 'app-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Boton, Icono, Modal, Tarjeta],
  templateUrl: './perfil.html',
})
export class Perfil {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly tema = inject(TemaService);

  protected readonly usuario = this.auth.usuario;
  protected readonly perfiles = PERFILES;
  protected readonly temas = TEMAS;
  protected readonly temaElegido = this.tema.elegida;
  protected readonly etiquetaRol = ETIQUETA_ROL;
  protected readonly passwordMin = PASSWORD_MIN;

  protected readonly datos = this.fb.nonNullable.group(
    {
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      apellido: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
      telefono: ['', [Validators.maxLength(30)]],
      conductor: false,
      propietario: false,
    },
    { validators: alMenosUnPerfil },
  );

  protected readonly clave = this.fb.nonNullable.group(
    {
      passwordActual: ['', [Validators.required]],
      password: [
        '',
        [Validators.required, Validators.minLength(PASSWORD_MIN), Validators.maxLength(PASSWORD_MAX)],
      ],
      repetirPassword: ['', [Validators.required]],
    },
    { validators: passwordsIguales },
  );

  /** Controla el modal de cambio de contrasena. */
  protected readonly modalClave = signal(false);

  protected readonly guardandoDatos = signal(false);
  protected readonly guardandoClave = signal(false);
  protected readonly borrando = signal(false);
  protected readonly errorDatos = signal<string | null>(null);
  protected readonly errorClave = signal<string | null>(null);
  protected readonly avisoDatos = signal<string | null>(null);
  protected readonly avisoClave = signal<string | null>(null);

  protected readonly rolActivo = computed(() => {
    const usuario = this.usuario();
    return usuario ? ETIQUETA_ROL[usuario.rol] : '';
  });

  protected readonly ayudaTema = computed(() => {
    if (this.temaElegido() !== 'sistema') return 'Parkit ignora el tema del sistema.';
    return this.tema.esOscuro()
      ? 'Tu sistema está en oscuro, así que Parkit se ve de noche.'
      : 'Tu sistema está en claro, así que Parkit se ve de día.';
  });

  constructor() {
    const usuario = this.usuario();
    if (usuario) {
      this.datos.setValue({
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        telefono: usuario.telefono ?? '',
        conductor: usuario.roles.includes('CONDUCTOR'),
        propietario: usuario.roles.includes('PROPIETARIO'),
      });
    }
  }

  protected elegirTema(preferencia: PreferenciaTema): void {
    this.tema.elegir(preferencia);
  }

  protected abrirModalClave(): void {
    this.clave.reset();
    this.errorClave.set(null);
    this.avisoClave.set(null);
    this.modalClave.set(true);
  }

  /** No se cierra en medio de un guardado para no dejar la accion a ciegas. */
  protected cerrarModalClave(): void {
    if (this.guardandoClave()) return;
    this.modalClave.set(false);
  }

  protected invalidoDatos(campo: string): boolean {
    return esInvalido(this.datos.get(campo));
  }

  protected invalidoClave(campo: string): boolean {
    return esInvalido(this.clave.get(campo));
  }

  protected passwordsDistintas(): boolean {
    return this.clave.controls.repetirPassword.touched && this.clave.hasError('passwordsDistintas');
  }

  protected guardarDatos(): void {
    if (this.datos.invalid) {
      this.datos.markAllAsTouched();
      return;
    }

    const valores = this.datos.getRawValue();
    const roles = PERFILES.filter((p) => valores[p.control]).map((p) => p.rol);
    const cambios: CambiosPerfil = {
      nombre: valores.nombre.trim(),
      apellido: valores.apellido.trim(),
      email: valores.email.trim(),
      telefono: valores.telefono.trim() || undefined,
      roles,
    };

    this.guardandoDatos.set(true);
    this.errorDatos.set(null);
    this.avisoDatos.set(null);

    const rolAnterior = this.usuario()?.rol;

    this.auth.actualizarPerfil(cambios).subscribe({
      next: (usuario) => {
        this.guardandoDatos.set(false);
        this.avisoDatos.set('Guardamos tus datos.');

        // Si se quito el perfil activo, el backend activa otro y hay que
        // mandar al usuario a la rama que ahora le corresponde.
        if (usuario.rol !== rolAnterior) {
          void this.router.navigateByUrl(inicioSegunRol(usuario.rol));
        }
      },
      error: (e: Error) => {
        this.guardandoDatos.set(false);
        this.errorDatos.set(e.message);
      },
    });
  }

  protected cambiarPassword(): void {
    if (this.clave.invalid) {
      this.clave.markAllAsTouched();
      return;
    }

    const { passwordActual, password } = this.clave.getRawValue();

    this.guardandoClave.set(true);
    this.errorClave.set(null);
    this.avisoClave.set(null);

    this.auth.actualizarPerfil({ passwordActual, password }).subscribe({
      next: () => {
        this.guardandoClave.set(false);
        this.clave.reset();
        this.modalClave.set(false);
        this.avisoClave.set('Cambiamos tu contraseña.');
      },
      error: (e: Error) => {
        this.guardandoClave.set(false);
        this.errorClave.set(e.message);
      },
    });
  }

  protected eliminarCuenta(): void {
    const seguro = confirm(
      '¿Eliminar tu cuenta? Se cancelan tus reservas futuras y no vas a poder volver a entrar.',
    );
    if (!seguro) return;

    this.borrando.set(true);
    this.errorDatos.set(null);

    this.auth.eliminarCuenta().subscribe({
      next: () => void this.router.navigate(['/ingresar']),
      error: (e: Error) => {
        this.borrando.set(false);
        this.errorDatos.set(e.message);
      },
    });
  }
}
