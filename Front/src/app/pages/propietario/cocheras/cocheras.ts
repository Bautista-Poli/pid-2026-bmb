import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { CocheraService } from '@app/services/cochera.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

const TIPOS: TipoVehiculo[] = ['AUTO', 'MOTO', 'CAMIONETA'];

/** Detalles de ubicacion comunes; al elegir uno se sugiere tambien el prefijo. */
const SUGERENCIAS_DETALLE = [
  { detalle: 'Planta baja', prefijo: 'PB' },
  { detalle: 'Primer piso', prefijo: 'P1' },
  { detalle: 'Segundo piso', prefijo: 'P2' },
  { detalle: 'Subsuelo', prefijo: 'SS' },
];

const SIN_DETALLE = 'Sin detalle';

const TONO_ESTADO: Record<EstadoCochera, TonoEtiqueta> = {
  LIBRE: 'exito',
  OCUPADA: 'peligro',
  RESERVADA: 'aviso',
  INACTIVA: 'neutro',
};

/**
 * Pantalla `/propietario/estacionamientos/:estacionamientoId/cocheras` · rol PROPIETARIO
 *
 * Alta por cantidad (lotes con detalle de ubicacion), edicion y baja logica de
 * las cocheras de un estacionamiento.
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

  /** Cocheras agrupadas por detalle de ubicacion, en el orden en que aparecen. */
  protected readonly grupos = computed(() => {
    const porDetalle = new Map<string, Cochera[]>();
    for (const cochera of this.recursoCocheras.value()) {
      const detalle = cochera.sector || SIN_DETALLE;
      porDetalle.set(detalle, [...(porDetalle.get(detalle) ?? []), cochera]);
    }
    return [...porDetalle].map(([detalle, cocheras]) => ({ detalle, cocheras }));
  });

  // Con una cochera elegida se muestra el formulario de edicion; si no, el de alta por lotes.
  protected readonly editando = signal<Cochera | null>(null);

  protected readonly sugerencias = SUGERENCIAS_DETALLE;

  protected readonly formularioLotes = this.fb.group({
    lotes: this.fb.array([this.nuevoLote()]),
  });

  protected get lotes() {
    return this.formularioLotes.controls.lotes;
  }

  protected readonly formulario = this.fb.nonNullable.group({
    identificador: ['', [Validators.required, Validators.maxLength(20)]],
    sector: ['', [Validators.maxLength(20)]],
    tipo: this.fb.nonNullable.control<TipoVehiculo>('AUTO'),
    cubierta: false,
  });

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected detalle(cochera: Cochera): string {
    return [cochera.cubierta ? 'Cubierta' : 'Descubierta', this.etiquetaTipo[cochera.tipoVehiculo]].join(
      ' · ',
    );
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
    this.formulario.setValue({
      identificador: cochera.identificador,
      sector: cochera.sector,
      tipo: cochera.tipoVehiculo,
      cubierta: cochera.cubierta,
    });
  }

  protected cancelarEdicion(): void {
    this.editando.set(null);
    this.formulario.reset();
  }

  protected agregarLote(): void {
    this.lotes.push(this.nuevoLote());
  }

  protected quitarLote(indice: number): void {
    if (this.lotes.length > 1) this.lotes.removeAt(indice);
  }

  protected elegirTipoLote(indice: number, tipo: TipoVehiculo): void {
    this.lotes.at(indice).controls.tipo.setValue(tipo);
  }

  protected usarSugerencia(indice: number, sugerencia: { detalle: string; prefijo: string }): void {
    this.lotes.at(indice).patchValue({ sector: sugerencia.detalle, prefijo: sugerencia.prefijo });
  }

  protected invalidoLote(indice: number, campo: 'cantidad' | 'sector' | 'prefijo'): boolean {
    const control = this.lotes.at(indice).controls[campo];
    return control.invalid && control.touched;
  }

  /** Identificadores que va a generar el lote, continuando la numeracion existente. */
  protected vistaPrevia(indice: number): string {
    const { cantidad, prefijo } = this.lotes.at(indice).getRawValue();
    const base = prefijo.trim();
    if (!base || !Number.isInteger(cantidad) || cantidad < 1) return '';

    const desde = this.ultimoNumero(base, indice) + 1;
    const hasta = desde + cantidad - 1;
    return cantidad === 1 ? `${base}-${desde}` : `${base}-${desde} … ${base}-${hasta}`;
  }

  protected crearLotes(): void {
    if (this.lotes.invalid) {
      this.lotes.markAllAsTouched();
      return;
    }

    const lotes = this.lotes.getRawValue().map((lote) => ({
      cantidad: lote.cantidad,
      sector: lote.sector.trim(),
      prefijo: lote.prefijo.trim(),
      tipoVehiculo: lote.tipo,
      cubierta: lote.cubierta,
    }));

    this.enviando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    this.cocheras.crearLote(this.estacionamientoId(), lotes).subscribe({
      next: (creadas) => {
        this.enviando.set(false);
        this.aviso.set(
          creadas.length === 1 ? 'Agregamos 1 cochera.' : `Agregamos ${creadas.length} cocheras.`,
        );
        this.lotes.clear();
        this.lotes.push(this.nuevoLote());
        this.recursoCocheras.reload();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  protected guardar(): void {
    const cochera = this.editando();
    if (!cochera) return;

    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    const cambios = {
      identificador: valores.identificador.trim(),
      sector: valores.sector.trim(),
      tipoVehiculo: valores.tipo,
      cubierta: valores.cubierta,
    };

    this.enviando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    this.cocheras.actualizar(cochera, cambios).subscribe({
      next: (guardada) => {
        this.enviando.set(false);
        this.aviso.set(`Guardamos los cambios de la cochera ${guardada.identificador}.`);
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
      `¿Dar de baja la cochera ${cochera.identificador}? No se va a poder reservar y se cancelan sus reservas vigentes. Podés reactivarla después.`,
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

  protected reactivar(cochera: Cochera): void {
    this.error.set(null);
    this.aviso.set(null);

    this.cocheras.reactivar(cochera).subscribe({
      next: () => {
        this.aviso.set(`La cochera ${cochera.identificador} volvió a estar activa.`);
        this.recursoCocheras.reload();
      },
      error: (e: Error) => this.error.set(e.message),
    });
  }

  protected eliminar(cochera: Cochera): void {
    const seguro = confirm(
      `¿Eliminar la cochera ${cochera.identificador}? Se borra definitivamente y no se puede deshacer. Solo es posible si nunca tuvo reservas.`,
    );
    if (!seguro) return;

    this.error.set(null);
    this.aviso.set(null);

    this.cocheras.eliminar(cochera).subscribe({
      next: () => {
        this.aviso.set(`La cochera ${cochera.identificador} fue eliminada.`);
        this.recursoCocheras.reload();
      },
      error: (e: Error) => this.error.set(e.message),
    });
  }

  private nuevoLote() {
    return this.fb.nonNullable.group({
      cantidad: [10, [Validators.required, Validators.min(1), Validators.max(200)]],
      sector: ['', [Validators.required, Validators.maxLength(20)]],
      prefijo: [
        '',
        [Validators.required, Validators.maxLength(10), Validators.pattern(/^[A-Za-z0-9_-]+$/)],
      ],
      tipo: this.fb.nonNullable.control<TipoVehiculo>('AUTO'),
      cubierta: false,
    });
  }

  /**
   * Ultimo numero usado con ese prefijo, entre las cocheras cargadas y los lotes
   * anteriores del formulario que comparten prefijo.
   */
  private ultimoNumero(prefijo: string, hastaLote: number): number {
    const patron = new RegExp(`^${prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
    const numeros = this.recursoCocheras
      .value()
      .map((c) => Number(patron.exec(c.identificador)?.[1] ?? 0));

    const anteriores = this.lotes
      .getRawValue()
      .slice(0, hastaLote)
      .filter((lote) => lote.prefijo.trim() === prefijo)
      .reduce((suma, lote) => suma + (Number.isInteger(lote.cantidad) ? lote.cantidad : 0), 0);

    return Math.max(0, ...numeros) + anteriores;
  }
}
