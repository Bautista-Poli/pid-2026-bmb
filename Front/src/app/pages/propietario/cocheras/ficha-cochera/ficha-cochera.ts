import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { Boton, Confirmar, Etiqueta, Icono, TonoEtiqueta } from '@app/components/ui';
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
  cocheraActiva,
} from '@app/models';
import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { CocheraService } from '@app/services/propietario/cochera.service';
import { aInstante, desdeFechaISO } from '@app/utils/fecha.util';
import { BloqueoCochera } from '../bloqueo-cochera/bloqueo-cochera';
import { CambioCocheras } from '../planta.interface';

/** Cuantas reservas por delante muestra la ficha. */
const MAX_PROXIMAS = 3;

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
 * Se arregla sola: guarda los cambios, da de baja, reactiva, elimina, bloquea
 * y desbloquea (con sus confirmaciones y su error). A quien la usa solo le
 * avisa que algo cambio, para que recargue, y que se quiere cerrar:
 *
 *   <app-ficha-cochera [cochera]="cochera" (cambiada)="alCambiar($event)" (cerrar)="cerrarPanel()" />
 */
@Component({
  selector: 'app-ficha-cochera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, BloqueoCochera, Boton, Confirmar, Etiqueta, Icono],
  templateUrl: './ficha-cochera.html',
  styleUrls: ['../compartido.css', './ficha-cochera.css'],
  host: { style: 'display: contents' },
})
export class FichaCochera {
  private readonly fb = inject(FormBuilder);
  private readonly cocheras = inject(CocheraService);

  readonly cochera = input.required<Cochera>();
  /** Reservas del estacionamiento: de aca salen las proximas de esta cochera. */
  readonly reservas = input<ReservaDetallada[]>([]);
  /** Nombres de las plantas cargadas, para sugerirlas al escribir. */
  readonly plantas = input<string[]>([]);

  readonly cerrar = output<void>();
  /** Ya se hizo el pedido: la pantalla recarga las cocheras y muestra el aviso. */
  readonly cambiada = output<CambioCocheras>();

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Accion que espera confirmacion (abre su modal), o null. */
  protected readonly confirmando = signal<'baja' | 'eliminar' | null>(null);
  /** Si esta abierto el modal de bloqueo. */
  protected readonly bloqueando = signal(false);

  protected readonly activa = computed(() => cocheraActiva(this.cochera()));

  /** Las proximas reservas vigentes de la cochera, de la mas cercana a la mas lejana. */
  protected readonly proximas = computed(() =>
    this.reservas()
      .filter((r) => r.cocheraId === this.cochera().id && reservaEnJuego(r))
      .sort((a, b) => aInstante(a.fecha, a.horaDesde).localeCompare(aInstante(b.fecha, b.horaDesde)))
      .slice(0, MAX_PROXIMAS),
  );

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
    if (cochera.id !== this.cargadaId) this.error.set(null);
    this.cargadaId = cochera.id;
    this.formulario.reset({
      identificador: cochera.identificador,
      sector: cochera.sector ?? '',
      tipo: cochera.tipoVehiculo,
      cubierta: cochera.cubierta,
    });
  }

  /** Guarda lo editado; si cambio de planta, el plano pasa a mostrar esa planta. */
  protected guardar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const valores = this.formulario.getRawValue();
    const cambios: Partial<NuevaCochera> = {
      identificador: valores.identificador.trim().toUpperCase(),
      sector: valores.sector.trim(),
      tipoVehiculo: valores.tipo,
      cubierta: valores.cubierta,
    };
    this.ejecutar(this.cocheras.actualizar(this.cochera(), cambios), {
      aviso: `Guardamos los cambios de la cochera ${cambios.identificador}.`,
      planta: cambios.sector || undefined,
    });
  }

  protected reactivar(): void {
    const cochera = this.cochera();
    this.ejecutar(this.cocheras.reactivar(cochera), {
      aviso: `La cochera ${cochera.identificador} volvió a estar activa.`,
    });
  }

  protected desbloquear(): void {
    const cochera = this.cochera();
    this.ejecutar(this.cocheras.desbloquear(cochera), {
      aviso: `La cochera ${cochera.identificador} quedó desbloqueada.`,
    });
  }

  /** Ya confirmada: la da de baja (cancela sus reservas vigentes) y cierra la ficha. */
  protected darDeBaja(): void {
    const cochera = this.cochera();
    this.confirmando.set(null);
    this.ejecutar(
      this.cocheras.darDeBaja(cochera),
      { aviso: `La cochera ${cochera.identificador} quedó dada de baja.` },
      true,
    );
  }

  /** Ya confirmada: la borra del todo (solo si nunca tuvo reservas) y cierra la ficha. */
  protected eliminar(): void {
    const cochera = this.cochera();
    this.confirmando.set(null);
    this.ejecutar(
      this.cocheras.eliminar(cochera),
      { aviso: `La cochera ${cochera.identificador} fue eliminada.` },
      true,
    );
  }

  /** El modal de bloqueo ya la bloqueo: avisa con su mensaje y cierra la ficha. */
  protected alBloquear(aviso: string): void {
    this.bloqueando.set(false);
    this.cambiada.emit({ aviso });
    this.cerrar.emit();
  }

  /**
   * Corre el pedido y avisa a la pantalla. Si falla, el error queda en la
   * ficha y se avisa igual (sin mensaje) para que el plano se ponga al dia.
   */
  private ejecutar(pedido: Observable<unknown>, cambio: CambioCocheras, cerrarAlTerminar = false): void {
    this.enviando.set(true);
    this.error.set(null);

    pedido.subscribe({
      next: () => {
        this.enviando.set(false);
        this.cambiada.emit(cambio);
        if (cerrarAlTerminar) this.cerrar.emit();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
        this.cambiada.emit({});
      },
    });
  }

  protected descartar(): void {
    this.cargarFormulario(this.cochera());
  }
}
