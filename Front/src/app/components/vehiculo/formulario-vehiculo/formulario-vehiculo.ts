import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Boton, Chip } from '@app/components/ui';
import { ETIQUETA_TIPO_VEHICULO, NuevoVehiculo, TipoVehiculo, Vehiculo } from '@app/models';

/** Orden de los chips, igual que en los filtros de explorar. */
const TIPOS: TipoVehiculo[] = ['AUTO', 'MOTO', 'CAMIONETA'];

/**
 * Formatos de patente argentina por tipo, viejo y Mercosur. Mismas reglas que
 * el backend (vehiculo.validator.js); la moto es la unica distinta.
 */
const FORMATOS_PATENTE = {
  moto: { regex: /^(\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/, ejemplo: 'A 123 BCD', ejemplos: '123 ABC o A 123 BCD' },
  auto: { regex: /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/, ejemplo: 'AB 123 CD', ejemplos: 'ABC 123 o AB 123 CD' },
};

function formatoPatente(tipo: TipoVehiculo) {
  return tipo === 'MOTO' ? FORMATOS_PATENTE.moto : FORMATOS_PATENTE.auto;
}

/** Cruza la patente con el tipo elegido: cambiar el chip revalida al instante. */
function patenteSegunTipo(grupo: AbstractControl): ValidationErrors | null {
  const patente = String(grupo.get('patente')?.value ?? '').toUpperCase().replace(/\s+/g, '');
  const tipo = grupo.get('tipo')?.value as TipoVehiculo;
  if (!patente) return null;
  return formatoPatente(tipo).regex.test(patente) ? null : { patenteInvalida: true };
}

/**
 * Formulario de datos de un vehiculo, compartido por el alta y la edicion.
 * Si recibe un `vehiculo` precarga sus datos y actua como editor; si no,
 * arranca vacio para dar de alta uno nuevo. Emite los datos ya validados por
 * `guardar`; quien lo usa decide si llama a crear o a actualizar.
 */
@Component({
  selector: 'app-formulario-vehiculo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Boton, Chip],
  templateUrl: './formulario-vehiculo.html',
})
export class FormularioVehiculo {
  private readonly fb = inject(FormBuilder);

  /** Vehiculo a editar. `null` (el default) es el modo alta. */
  readonly vehiculo = input<Vehiculo | null>(null);
  readonly enviando = input(false);
  readonly error = input<string | null>(null);
  /** Aviso de que el primer vehiculo queda predeterminado (solo en el alta). */
  readonly mostrarHintPrimero = input(false);
  readonly textoEnviar = input('Guardar');

  readonly guardar = output<NuevoVehiculo>();

  protected readonly tipos = TIPOS;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;

  /** Mismas reglas que valida el backend (vehiculo.validator.js). */
  protected readonly formulario = this.fb.nonNullable.group({
    patente: ['', [Validators.required]],
    tipo: this.fb.nonNullable.control<TipoVehiculo>('AUTO'),
    marca: ['', [Validators.maxLength(60)]],
    modelo: ['', [Validators.maxLength(60)]],
    color: ['', [Validators.maxLength(30)]],
    predeterminado: false,
  }, { validators: patenteSegunTipo });

  constructor() {
    // Al abrir el editor, el formulario se precarga con los datos del vehiculo.
    effect(() => {
      const vehiculo = this.vehiculo();
      if (!vehiculo) return;
      this.formulario.setValue({
        patente: vehiculo.patente,
        tipo: vehiculo.tipo,
        marca: vehiculo.marca ?? '',
        modelo: vehiculo.modelo ?? '',
        color: vehiculo.color ?? '',
        predeterminado: vehiculo.predeterminado,
      });
    });
  }

  protected patenteConError(): boolean {
    const patente = this.formulario.controls.patente;
    return patente.touched && (patente.invalid || this.formulario.hasError('patenteInvalida'));
  }

  protected formato() {
    return formatoPatente(this.formulario.controls.tipo.value);
  }

  protected elegirTipo(tipo: TipoVehiculo): void {
    this.formulario.controls.tipo.setValue(tipo);
  }

  protected enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    this.guardar.emit({
      patente: valores.patente.trim(),
      tipo: valores.tipo,
      marca: valores.marca.trim() || null,
      modelo: valores.modelo.trim() || null,
      color: valores.color.trim() || null,
      // Sin marcar decide el backend: el primer vehiculo queda como predeterminado.
      predeterminado: valores.predeterminado || undefined,
    });
  }
}
