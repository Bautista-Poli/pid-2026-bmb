import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import {
  Boton,
  Cargando,
  Chip,
  EstadoVacio,
  Etiqueta,
  Miniatura,
  Tarjeta,
  TonoEtiqueta,
} from '@app/components/ui';
import {
  Cochera,
  EstadoCochera,
  ETIQUETA_ESTADO_COCHERA,
  ETIQUETA_TIPO_VEHICULO,
  Id,
  TipoVehiculo,
} from '@app/models';
import { numeroDeCochera, siguienteNumero } from '@app/utils/numero-cochera.util';
import { CocheraService } from '@app/services/cochera.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

const TIPOS: TipoVehiculo[] = ['AUTO', 'MOTO', 'CAMIONETA'];

const TONO_ESTADO: Record<EstadoCochera, TonoEtiqueta> = {
  LIBRE: 'exito',
  OCUPADA: 'peligro',
  RESERVADA: 'aviso',
  INACTIVA: 'neutro',
};

/**
 * Pantalla `/propietario/estacionamientos/:estacionamientoId/cocheras` · rol PROPIETARIO
 *
 * Alta, edicion y baja logica de las cocheras de un estacionamiento.
 */
@Component({
  selector: 'app-cocheras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Boton,
    Cargando,
    Chip,
    EstadoVacio,
    Etiqueta,
    Miniatura,
    Tarjeta,
  ],
  templateUrl: './cocheras.html',
})
export class Cocheras {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly cocheras = inject(CocheraService);
  private readonly fb = inject(FormBuilder);

  readonly estacionamientoId = input.required<Id>();

  protected readonly tipos = TIPOS;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_COCHERA;
  protected readonly tonoEstado = TONO_ESTADO;

  protected readonly recursoEstacionamiento = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.estacionamientos.obtener(params),
  });

  protected readonly recursoCocheras = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.cocheras.listarPorEstacionamiento(params),
    defaultValue: [] as Cochera[],
  });

  protected readonly activas = computed(
    () => this.recursoCocheras.value().filter((c) => c.estado !== 'INACTIVA').length,
  );

  // Si hay una cochera elegida el formulario la edita; si no, da de alta una nueva.
  protected readonly editando = signal<Cochera | null>(null);

  protected readonly formulario = this.fb.nonNullable.group({
    numero: [null as number | null, [Validators.required, Validators.min(1), Validators.max(9999)]],
    cantidad: [1, [Validators.required, Validators.min(1), Validators.max(200)]],
    sector: ['', [Validators.maxLength(40)]],
    tipo: this.fb.nonNullable.control<TipoVehiculo>('AUTO'),
    cubierta: false,
  });

  private readonly cantidad = toSignal(this.formulario.controls.cantidad.valueChanges, {
    initialValue: 1,
  });

  // Cargar varias cocheras de una (mismo piso/sector) en vez de una por una:
  // con `cantidad` > 1 el numero lo asigna el backend, asi que el campo
  // "Numero" se oculta y "Ubicacion" pasa a ser obligatorio.
  protected readonly esLote = computed(() => !this.editando() && this.cantidad() > 1);

  protected readonly rangoLote = computed(() => {
    const desde = siguienteNumero(this.recursoCocheras.value());
    const hasta = desde + this.cantidad() - 1;
    return `Se van a crear del ${desde} al ${hasta}.`;
  });

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  constructor() {
    // Dar de alta una cochera es escribir un numero, y ese numero casi siempre
    // es el que sigue: se propone solo, mientras el propietario no lo toque.
    effect(() => {
      const cocheras = this.recursoCocheras.value();
      if (this.recursoCocheras.isLoading() || this.editando()) return;

      const numero = this.formulario.controls.numero;
      if (numero.pristine) numero.setValue(siguienteNumero(cocheras));
    });

    // En modo lote el numero no se elige (lo arma el backend) y la ubicacion
    // pasa a ser obligatoria: es lo unico que distingue un lote de otro.
    effect(() => {
      const enLote = this.esLote();
      const numero = this.formulario.controls.numero;
      const sector = this.formulario.controls.sector;

      if (enLote) numero.disable({ emitEvent: false });
      else numero.enable({ emitEvent: false });

      sector.setValidators(enLote ? [Validators.required, Validators.maxLength(40)] : [Validators.maxLength(40)]);
      sector.updateValueAndValidity({ emitEvent: false });
    });
  }

  /** Vuelve el formulario al alta, con el proximo numero propuesto. */
  private proponerSiguiente(): void {
    const numero = this.formulario.controls.numero;
    numero.setValue(siguienteNumero(this.recursoCocheras.value()));
    numero.markAsPristine();
  }

  protected detalle(cochera: Cochera): string {
    const partes = [
      cochera.sector,
      cochera.cubierta ? 'Cubierta' : 'Descubierta',
      this.etiquetaTipo[cochera.tipoVehiculo],
    ];
    return partes.filter(Boolean).join(' · ');
  }

  protected invalido(campo: string): boolean {
    const control = this.formulario.get(campo);
    return Boolean(control?.invalid && control.touched);
  }

  protected elegirTipo(tipo: TipoVehiculo): void {
    this.formulario.controls.tipo.setValue(tipo);
  }

  protected editar(cochera: Cochera): void {
    this.editando.set(cochera);
    this.error.set(null);
    this.aviso.set(null);
    // Un identificador viejo (`A-01`) no tiene numero: el campo queda vacio y
    // el `required` obliga a asignarle uno al guardar.
    this.formulario.setValue({
      numero: numeroDeCochera(cochera.identificador),
      cantidad: 1,
      sector: cochera.sector,
      tipo: cochera.tipoVehiculo,
      cubierta: cochera.cubierta,
    });
  }

  protected cancelarEdicion(): void {
    this.editando.set(null);
    this.formulario.reset();
    this.proponerSiguiente();
  }

  protected guardar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    const sector = valores.sector.trim();
    const cochera = this.editando();

    if (cochera) {
      this.enviar(
        this.cocheras.actualizar(cochera, {
          identificador: String(valores.numero),
          sector,
          tipoVehiculo: valores.tipo,
          cubierta: valores.cubierta,
        }),
        (guardada) => `Guardamos los cambios de la cochera ${guardada.identificador}.`,
      );
      return;
    }

    if (this.esLote()) {
      this.enviar(
        this.cocheras.crearLote({
          estacionamientoId: this.estacionamientoId(),
          cantidad: valores.cantidad,
          sector,
          tipoVehiculo: valores.tipo,
          cubierta: valores.cubierta,
        }),
        (creadas) =>
          `Agregamos ${creadas.length} cocheras en ${sector} (${creadas[0].identificador} a ${creadas.at(-1)!.identificador}).`,
      );
      return;
    }

    this.enviar(
      this.cocheras.crear({
        estacionamientoId: this.estacionamientoId(),
        identificador: String(valores.numero),
        sector,
        tipoVehiculo: valores.tipo,
        cubierta: valores.cubierta,
      }),
      (creada) => `Agregamos la cochera ${creada.identificador}.`,
    );
  }

  /** Dispara el pedido de alta/edicion y maneja los signals de estado que comparten los tres. */
  private enviar<T>(pedido: Observable<T>, mensaje: (resultado: T) => string): void {
    this.enviando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    pedido.subscribe({
      next: (resultado) => {
        this.enviando.set(false);
        this.aviso.set(mensaje(resultado));
        this.cancelarEdicion();
        this.recursoCocheras.reload();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  protected darDeBaja(cochera: Cochera): void {
    const seguro = confirm(
      `¿Dar de baja la cochera ${cochera.identificador}? No se va a poder reservar y no se puede deshacer.`,
    );
    if (!seguro) return;

    this.error.set(null);
    this.aviso.set(null);

    this.cocheras.darDeBaja(cochera).subscribe({
      next: () => {
        if (this.editando()?.id === cochera.id) this.cancelarEdicion();
        this.aviso.set(`La cochera ${cochera.identificador} quedó dada de baja.`);
        this.recursoCocheras.reload();
      },
      error: (e: Error) => this.error.set(e.message),
    });
  }
}
