import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Boton, Etiqueta, Icono, TonoEtiqueta } from '@app/components/ui';
import {
  Cochera,
  ETIQUETA_ESTADO_COCHERA,
  ETIQUETA_TIPO_VEHICULO,
  EstadoCochera,
  ICONO_TIPO_VEHICULO,
  NuevaCochera,
  ReservaDetallada,
  TIPOS_VEHICULO,
  TipoVehiculo,
} from '@app/models';
import { desdeFechaISO } from '@app/utils/fecha.util';

const TONO_ESTADO: Record<EstadoCochera, TonoEtiqueta> = {
  LIBRE: 'exito',
  OCUPADA: 'peligro',
  RESERVADA: 'aviso',
  INACTIVA: 'neutro',
};

/**
 * Ficha de una cochera en el panel lateral de Cocheras (cocheras.ts): numero,
 * planta, tipo de vehiculo, techo y sus proximas reservas. Si esta dada de baja,
 * solo ofrece reactivarla o eliminarla.
 *
 * Los cambios se guardan desde la pantalla, que recibe `guardar` con lo
 * editado; al volver la cochera actualizada, la ficha se recarga sola.
 */
@Component({
  selector: 'app-ficha-cochera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, Boton, Etiqueta, Icono],
  templateUrl: './ficha-cochera.html',
  styleUrls: ['../compartido.css', './ficha-cochera.css'],
  host: { style: 'display: contents' },
})
export class FichaCochera {
  private readonly fb = inject(FormBuilder);

  readonly cochera = input.required<Cochera>();
  /** Las proximas reservas vigentes de la cochera. */
  readonly proximas = input<ReservaDetallada[]>([]);
  readonly enviando = input(false);

  readonly cerrar = output<void>();
  readonly guardar = output<Partial<NuevaCochera>>();
  readonly reactivar = output<void>();
  readonly eliminar = output<void>();
  readonly darDeBaja = output<void>();
  readonly bloquear = output<void>();
  readonly desbloquear = output<void>();

  protected readonly tipos = TIPOS_VEHICULO;
  protected readonly iconoTipo = ICONO_TIPO_VEHICULO;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_COCHERA;
  protected readonly tonoEstado = TONO_ESTADO;
  protected readonly desdeFechaISO = desdeFechaISO;

  protected readonly formulario = this.fb.nonNullable.group({
    identificador: ['', [Validators.required, Validators.maxLength(20)]],
    sector: ['', [Validators.maxLength(20)]],
    tipo: this.fb.nonNullable.control<TipoVehiculo>('AUTO'),
    cubierta: false,
  });

  private cargadaId: Cochera['id'] | null = null;

  /**
   * Al llegar otra cochera, la ficha se llena con sus datos. Si es la misma y
   * se estaba editando (p. ej. fallo el guardado), se conserva lo editado; si
   * ya trae lo editado (se guardo bien), queda limpia.
   */
  private readonly alCambiarCochera = effect(() => {
    const cochera = this.cochera();
    untracked(() => {
      const editando = cochera.id === this.cargadaId && this.formulario.dirty;
      if (editando && !this.coincide(cochera)) return;
      this.cargarFormulario(cochera);
    });
  });

  private coincide(cochera: Cochera): boolean {
    const v = this.formulario.getRawValue();
    return (
      v.identificador.trim().toUpperCase() === cochera.identificador &&
      v.sector.trim() === (cochera.sector ?? '') &&
      v.tipo === cochera.tipoVehiculo &&
      v.cubierta === cochera.cubierta
    );
  }

  protected invalido(campo: string): boolean {
    const control = this.formulario.get(campo);
    return Boolean(control?.invalid && control.touched);
  }

  protected elegirTipo(tipo: TipoVehiculo): void {
    this.formulario.controls.tipo.setValue(tipo);
    this.formulario.markAsDirty();
  }

  protected alternarCubierta(): void {
    const control = this.formulario.controls.cubierta;
    control.setValue(!control.value);
    this.formulario.markAsDirty();
  }

  private cargarFormulario(cochera: Cochera): void {
    this.cargadaId = cochera.id;
    this.formulario.reset({
      identificador: cochera.identificador,
      sector: cochera.sector ?? '',
      tipo: cochera.tipoVehiculo,
      cubierta: cochera.cubierta,
    });
  }

  /** Avisa los cambios a la pantalla, que los guarda. */
  protected enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const valores = this.formulario.getRawValue();
    this.guardar.emit({
      identificador: valores.identificador.trim().toUpperCase(),
      sector: valores.sector.trim(),
      tipoVehiculo: valores.tipo,
      cubierta: valores.cubierta,
    });
  }

  protected descartar(): void {
    this.cargarFormulario(this.cochera());
  }
}
