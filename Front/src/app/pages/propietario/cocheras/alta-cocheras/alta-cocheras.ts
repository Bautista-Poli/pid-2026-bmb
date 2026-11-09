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
import { Boton, Icono, Modal } from '@app/components/ui';
import { ETIQUETA_TIPO_VEHICULO, ICONO_TIPO_VEHICULO, Id, TIPOS_VEHICULO, TipoVehiculo } from '@app/models';
import { CocheraService } from '@app/services/propietario/cochera.service';
import { Planta, SIN_PLANTA } from '../constantes';

/** Plantas comunes; al elegir una se sugiere tambien el prefijo. */
const SUGERENCIAS_PLANTA = [
  { detalle: 'Planta baja', prefijo: 'PB' },
  { detalle: 'Primer piso', prefijo: 'P1' },
  { detalle: 'Segundo piso', prefijo: 'P2' },
  { detalle: 'Subsuelo', prefijo: 'SS' },
];

/** Una celda de la vista previa del alta: existente o nueva. */
interface CeldaPrevia {
  id: string;
  nueva: boolean;
  /** Techo de las nuevas; `null` en las existentes (van en gris, sin detalle). */
  cubierta: boolean | null;
}

/**
 * Modal de Cocheras (cocheras.ts) para agregar cocheras por cantidad: uno o
 * varios grupos (planta, cantidad, prefijo, tipo y techo) con la vista previa
 * de como quedan numeradas, a continuacion de las existentes. Las crea y avisa
 * con `creadas`.
 */
@Component({
  selector: 'app-alta-cocheras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Boton, Icono, Modal],
  templateUrl: './alta-cocheras.html',
  styleUrls: ['../compartido.css', './alta-cocheras.css'],
})
export class AltaCocheras {
  private readonly fb = inject(FormBuilder);
  private readonly cocheras = inject(CocheraService);

  readonly abierto = input(false);
  readonly estacionamientoId = input<Id>();
  /** Las plantas con sus cocheras actuales: para los chips, los prefijos y la numeracion. */
  readonly plantas = input<Planta[]>([]);
  /** Planta con la que arranca el primer grupo ('' = nueva planta). */
  readonly planta = input<string | null>(null);

  readonly cerrado = output<void>();
  readonly creadas = output<{ cantidad: number; planta: string }>();

  protected readonly tipos = TIPOS_VEHICULO;
  protected readonly iconoTipo = ICONO_TIPO_VEHICULO;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;

  protected readonly enviando = signal(false);
  protected readonly errorAlta = signal<string | null>(null);

  protected readonly formularioLotes = this.fb.group({
    lotes: this.fb.array([this.nuevoLote()]),
  });

  protected get lotes() {
    return this.formularioLotes.controls.lotes;
  }

  /** Cada vez que se abre arranca con un grupo vacio, en la planta pedida. */
  private readonly alAbrir = effect(() => {
    if (!this.abierto()) return;
    untracked(() => {
      this.lotes.clear();
      this.lotes.push(this.nuevoLote());
      const destino = this.planta();
      if (destino && destino !== SIN_PLANTA) {
        this.usarPlanta(0, { detalle: destino, prefijo: this.prefijoDePlanta(destino) });
      }
      this.errorAlta.set(null);
    });
  });

  private readonly nombresPlantas = computed(() =>
    this.plantas()
      .map((p) => p.nombre)
      .filter((nombre) => nombre !== SIN_PLANTA),
  );

  /** Plantas para los chips del alta: las cargadas primero, despues las sugeridas. */
  protected readonly opcionesPlanta = computed(() => {
    const cargadas = this.nombresPlantas().map((detalle) => ({
      detalle,
      prefijo: this.prefijoDePlanta(detalle),
    }));
    const nombres = new Set(cargadas.map((p) => p.detalle.toLowerCase()));
    return [...cargadas, ...SUGERENCIAS_PLANTA.filter((s) => !nombres.has(s.detalle.toLowerCase()))];
  });

  protected cerrarAlta(): void {
    this.cerrado.emit();
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

  protected alternarCubiertaLote(indice: number): void {
    const control = this.lotes.at(indice).controls.cubierta;
    control.setValue(!control.value);
  }

  protected cambiarCantidad(indice: number, delta: number): void {
    const control = this.lotes.at(indice).controls.cantidad;
    const actual = Number.isInteger(control.value) ? control.value : 0;
    control.setValue(Math.min(200, Math.max(1, actual + delta)));
  }

  protected usarPlanta(indice: number, planta: { detalle: string; prefijo: string }): void {
    this.lotes.at(indice).patchValue({ sector: planta.detalle, prefijo: planta.prefijo });
  }

  protected invalidoLote(indice: number, campo: 'cantidad' | 'sector' | 'prefijo'): boolean {
    const control = this.lotes.at(indice).controls[campo];
    return control.invalid && control.touched;
  }

  /** Identificadores que va a generar el lote, continuando la numeracion existente. */
  protected vistaPrevia(indice: number): string {
    const rango = this.rango(indice);
    if (!rango) return '';
    const { prefijo, desde, hasta } = rango;
    return desde === hasta ? `${prefijo}-${desde}` : `${prefijo}-${desde} … ${prefijo}-${hasta}`;
  }

  /** Cuantas cocheras se van a crear en total, para el boton. */
  protected totalNuevas(): number {
    return this.lotes
      .getRawValue()
      .reduce((suma, lote) => suma + (Number.isInteger(lote.cantidad) && lote.cantidad > 0 ? lote.cantidad : 0), 0);
  }

  /**
   * Vista previa de cada planta tocada por el alta: sus cocheras actuales en
   * gris y las nuevas resaltadas. Se muestran hasta 60 cocheras por planta.
   */
  protected previa(): { planta: string; celdas: CeldaPrevia[]; nuevas: number }[] {
    const porPlanta = new Map<string, CeldaPrevia[]>();

    this.lotes.getRawValue().forEach((lote, indice) => {
      const planta = lote.sector.trim() || 'Nueva planta';
      if (!porPlanta.has(planta)) {
        const existentes = this.plantas().find((p) => p.nombre === planta)?.cocheras ?? [];
        porPlanta.set(
          planta,
          existentes.map((c) => ({ id: c.identificador, nueva: false, cubierta: null })),
        );
      }
      const rango = this.rango(indice);
      if (rango) {
        const celdas = porPlanta.get(planta) as CeldaPrevia[];
        for (let n = rango.desde; n <= rango.hasta; n++) {
          celdas.push({ id: `${rango.prefijo}-${n}`, nueva: true, cubierta: lote.cubierta });
        }
      }
    });

    return [...porPlanta].map(([planta, celdas]) => {
      const existentes = celdas.filter((c) => !c.nueva);
      const nuevas = celdas.filter((c) => c.nueva).slice(0, 60);
      // Si no entran todas, se ven las ultimas existentes (las vecinas de las nuevas).
      const lugar = Math.max(0, 60 - nuevas.length);
      return {
        planta,
        nuevas: celdas.length - existentes.length,
        celdas: [...existentes.slice(Math.max(0, existentes.length - lugar)), ...nuevas],
      };
    });
  }

  /** Crea todas las cocheras de los lotes cargados. */
  protected crearLotes(): void {
    if (this.lotes.invalid) {
      this.lotes.markAllAsTouched();
      return;
    }

    const lotes = this.lotes.getRawValue().map((lote) => ({
      cantidad: lote.cantidad,
      sector: lote.sector.trim(),
      prefijo: lote.prefijo.trim().toUpperCase(),
      tipoVehiculo: lote.tipo,
      cubierta: lote.cubierta,
    }));

    const id = this.estacionamientoId();
    if (!id) return;

    this.enviando.set(true);
    this.errorAlta.set(null);

    this.cocheras.crearLote(id, lotes).subscribe({
      next: (creadas) => {
        this.enviando.set(false);
        this.creadas.emit({ cantidad: creadas.length, planta: lotes[0].sector });
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.errorAlta.set(e.message);
      },
    });
  }

  /** Formulario de un lote: cantidad, sector, prefijo, tipo y techo. */
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

  /** Prefijo que ya usa una planta ("PB" de "PB-7"), o uno sugerido por su nombre. */
  private prefijoDePlanta(planta: string): string {
    const cochera = this.plantas()
      .find((p) => p.nombre === planta)
      ?.cocheras.find((c) => /^.+-\d+$/.test(c.identificador));
    const deCochera = cochera?.identificador.replace(/-\d+$/, '');
    if (deCochera) return deCochera;
    const sugerida = SUGERENCIAS_PLANTA.find((s) => s.detalle.toLowerCase() === planta.toLowerCase());
    return sugerida?.prefijo ?? '';
  }

  private rango(indice: number): { prefijo: string; desde: number; hasta: number } | null {
    const { cantidad, prefijo } = this.lotes.at(indice).getRawValue();
    const base = prefijo.trim().toUpperCase();
    if (!base || !Number.isInteger(cantidad) || cantidad < 1) return null;
    const desde = this.ultimoNumero(base, indice) + 1;
    return { prefijo: base, desde, hasta: desde + cantidad - 1 };
  }

  /**
   * Ultimo numero usado con ese prefijo, entre las cocheras cargadas y los lotes
   * anteriores del formulario que comparten prefijo.
   */
  private ultimoNumero(prefijo: string, hastaLote: number): number {
    const patron = new RegExp(`^${prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
    const numeros = this.plantas()
      .flatMap((p) => p.cocheras)
      .map((c) => Number(patron.exec(c.identificador)?.[1] ?? 0));

    const anteriores = this.lotes
      .getRawValue()
      .slice(0, hastaLote)
      .filter((lote) => lote.prefijo.trim().toUpperCase() === prefijo)
      .reduce((suma, lote) => suma + (Number.isInteger(lote.cantidad) ? lote.cantidad : 0), 0);

    return Math.max(0, ...numeros) + anteriores;
  }
}
