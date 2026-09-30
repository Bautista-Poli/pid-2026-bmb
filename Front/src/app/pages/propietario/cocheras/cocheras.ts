import { DatePipe } from '@angular/common';
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
import { Observable, forkJoin } from 'rxjs';
import {
  Boton,
  Cargando,
  EstadoVacio,
  Etiqueta,
  Icono,
  Miniatura,
  Modal,
  NombreIcono,
  TonoEtiqueta,
} from '@app/components/ui';
import {
  Cochera,
  direccionCorta,
  EstadoCochera,
  ETIQUETA_ESTADO_COCHERA,
  ETIQUETA_TIPO_VEHICULO,
  Id,
  NuevaCochera,
  ReservaDetallada,
  TipoVehiculo,
} from '@app/models';
import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { CocheraService } from '@app/services/cochera.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { aInstante, desdeFechaISO } from '@app/utils/fecha.util';

const TIPOS: TipoVehiculo[] = ['AUTO', 'MOTO', 'CAMIONETA'];

const ICONO_TIPO: Record<TipoVehiculo, NombreIcono> = {
  AUTO: 'auto',
  MOTO: 'moto',
  CAMIONETA: 'camioneta',
};

/** Plantas comunes; al elegir una se sugiere tambien el prefijo. */
const SUGERENCIAS_PLANTA = [
  { detalle: 'Planta baja', prefijo: 'PB' },
  { detalle: 'Primer piso', prefijo: 'P1' },
  { detalle: 'Segundo piso', prefijo: 'P2' },
  { detalle: 'Subsuelo', prefijo: 'SS' },
];

const SIN_PLANTA = 'Sin planta';

const TONO_ESTADO: Record<EstadoCochera, TonoEtiqueta> = {
  LIBRE: 'exito',
  OCUPADA: 'peligro',
  RESERVADA: 'aviso',
  INACTIVA: 'neutro',
};

/** Fondo, borde y punto de cada lugar del plano segun su estado. */
const CLASE_LUGAR: Record<EstadoCochera, string> = {
  LIBRE: 'border-exito/30 bg-exito-suave',
  OCUPADA: 'border-ocupada/25 bg-ocupada/8',
  RESERVADA: 'border-baja/30 bg-baja/10',
  INACTIVA:
    'border-dashed border-borde text-plomo ' +
    'bg-[repeating-linear-gradient(135deg,var(--color-borde-sutil)_0_6px,var(--color-lienzo)_6px_12px)]',
};

const CLASE_PUNTO: Record<EstadoCochera, string> = {
  LIBRE: 'bg-exito',
  OCUPADA: 'bg-ocupada',
  RESERVADA: 'bg-baja',
  INACTIVA: 'bg-humo',
};

interface Planta {
  nombre: string;
  cocheras: Cochera[];
}

interface Confirmacion {
  titulo: string;
  texto: string;
  boton: string;
  accion: () => void;
}

/** Una celda de la vista previa del alta: existente o nueva. */
interface CeldaPrevia {
  id: string;
  nueva: boolean;
  /** Techo de las nuevas; `null` en las existentes (van en gris, sin detalle). */
  cubierta: boolean | null;
}

/**
 * Pantalla `/propietario/estacionamientos/:estacionamientoId/cocheras` · rol PROPIETARIO
 *
 * Plano de cocheras por planta. Tocar un lugar abre su ficha al costado (en
 * mobile, una hoja desde abajo); con Shift / Ctrl / Cmd se eligen varios y se
 * editan juntos. El alta por cantidad vive en un modal con vista previa.
 */
@Component({
  selector: 'app-cocheras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    Boton,
    Cargando,
    EstadoVacio,
    Etiqueta,
    Icono,
    Miniatura,
    Modal,
  ],
  templateUrl: './cocheras.html',
})
export class Cocheras {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly cocheras = inject(CocheraService);
  private readonly reservas = inject(ReservaService);
  private readonly fb = inject(FormBuilder);

  readonly estacionamientoId = input.required<Id>();

  protected readonly tipos = TIPOS;
  protected readonly iconoTipo = ICONO_TIPO;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_COCHERA;
  protected readonly tonoEstado = TONO_ESTADO;
  protected readonly claseLugar = CLASE_LUGAR;
  protected readonly clasePunto = CLASE_PUNTO;
  protected readonly direccionCorta = direccionCorta;
  protected readonly desdeFechaISO = desdeFechaISO;

  protected readonly recursoEstacionamiento = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.estacionamientos.obtener(params),
  });

  protected readonly recursoCocheras = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.cocheras.listarPorEstacionamiento(params),
    defaultValue: [] as Cochera[],
  });

  /** Reservas del estacionamiento, para las "proximas reservas" de cada cochera. */
  protected readonly recursoReservas = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.reservas.listarPorEstacionamiento(params),
    defaultValue: [] as ReservaDetallada[],
  });

  /* -------------------------------- resumen -------------------------------- */

  protected readonly resumen = computed(() => {
    const lista = this.recursoCocheras.value();
    const contar = (estado: EstadoCochera) => lista.filter((c) => c.estado === estado).length;
    return {
      total: lista.length - contar('INACTIVA'),
      libres: contar('LIBRE'),
      ocupadas: contar('OCUPADA'),
      reservadas: contar('RESERVADA'),
      inactivas: contar('INACTIVA'),
      cubiertas: lista.filter((c) => c.estado !== 'INACTIVA' && c.cubierta).length,
      descubiertas: lista.filter((c) => c.estado !== 'INACTIVA' && !c.cubierta).length,
    };
  });

  /* -------------------------------- plantas -------------------------------- */

  /** Cocheras agrupadas por planta (la columna `sector`), en el orden en que aparecen. */
  protected readonly plantas = computed<Planta[]>(() => {
    const porPlanta = new Map<string, Cochera[]>();
    for (const cochera of this.recursoCocheras.value()) {
      const nombre = cochera.sector?.trim() || SIN_PLANTA;
      porPlanta.set(nombre, [...(porPlanta.get(nombre) ?? []), cochera]);
    }
    return [...porPlanta].map(([nombre, cocheras]) => ({ nombre, cocheras }));
  });

  protected readonly nombresPlantas = computed(() =>
    this.plantas()
      .map((p) => p.nombre)
      .filter((nombre) => nombre !== SIN_PLANTA),
  );

  protected readonly plantaElegida = signal<string | null>(null);

  protected readonly plantaActiva = computed<Planta | null>(() => {
    const lista = this.plantas();
    return lista.find((p) => p.nombre === this.plantaElegida()) ?? lista[0] ?? null;
  });

  protected verPlanta(nombre: string): void {
    this.plantaElegida.set(nombre);
  }

  /* ------------------------------- seleccion ------------------------------- */

  protected readonly seleccion = signal<Id[]>([]);

  protected readonly elegidas = computed(() => {
    const ids = new Set(this.seleccion());
    return this.recursoCocheras.value().filter((c) => ids.has(c.id));
  });

  protected readonly unica = computed(() => {
    const lista = this.elegidas();
    return lista.length === 1 ? lista[0] : null;
  });

  protected estaElegida(cochera: Cochera): boolean {
    return this.seleccion().includes(cochera.id);
  }

  /** Clic: elige solo esa (o la suelta). Shift / Ctrl / Cmd: la suma o la saca. */
  protected tocar(cochera: Cochera, evento: MouseEvent): void {
    this.error.set(null);
    this.aviso.set(null);

    if (evento.shiftKey || evento.metaKey || evento.ctrlKey) {
      this.seleccion.update((ids) =>
        ids.includes(cochera.id) ? ids.filter((id) => id !== cochera.id) : [...ids, cochera.id],
      );
    } else if (this.seleccion().length === 1 && this.seleccion()[0] === cochera.id) {
      this.seleccion.set([]);
    } else {
      this.seleccion.set([cochera.id]);
    }

    const unica = this.unica();
    if (unica) this.cargarFormulario(unica);
    this.reiniciarMasivo();
  }

  protected elegirTodaLaPlanta(): void {
    const planta = this.plantaActiva();
    if (!planta) return;
    this.seleccion.set(planta.cocheras.filter((c) => c.estado !== 'INACTIVA').map((c) => c.id));
    this.reiniciarMasivo();
  }

  protected cerrarPanel(): void {
    this.seleccion.set([]);
  }

  /* ---------------------------- ficha de una ------------------------------- */

  protected readonly formulario = this.fb.nonNullable.group({
    identificador: ['', [Validators.required, Validators.maxLength(20)]],
    sector: ['', [Validators.maxLength(20)]],
    tipo: this.fb.nonNullable.control<TipoVehiculo>('AUTO'),
    cubierta: false,
  });

  /** Las proximas 3 reservas vigentes de la cochera abierta. */
  protected readonly proximas = computed(() => {
    const cochera = this.unica();
    if (!cochera) return [];
    return this.recursoReservas
      .value()
      .filter((r) => r.cocheraId === cochera.id && reservaEnJuego(r))
      .sort((a, b) =>
        aInstante(a.fecha, a.horaDesde).localeCompare(aInstante(b.fecha, b.horaDesde)),
      )
      .slice(0, 3);
  });

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
    this.formulario.reset({
      identificador: cochera.identificador,
      sector: cochera.sector ?? '',
      tipo: cochera.tipoVehiculo,
      cubierta: cochera.cubierta,
    });
  }

  protected guardar(): void {
    const cochera = this.unica();
    if (!cochera) return;

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

    this.ejecutar([this.cocheras.actualizar(cochera, cambios)], (guardadas) => {
      const guardada = guardadas[0] as Cochera;
      this.formulario.markAsPristine();
      if (cambios.sector) this.plantaElegida.set(cambios.sector);
      return `Guardamos los cambios de la cochera ${guardada.identificador}.`;
    });
  }

  protected descartar(): void {
    const cochera = this.unica();
    if (cochera) this.cargarFormulario(cochera);
  }

  /* ------------------------------ varias juntas ---------------------------- */

  protected readonly masivoTipo = signal<TipoVehiculo | null>(null);
  protected readonly masivoCubierta = signal<boolean | null>(null);
  protected readonly masivoPlanta = signal('');

  protected readonly hayCambiosMasivos = computed(
    () =>
      this.masivoTipo() !== null ||
      this.masivoCubierta() !== null ||
      this.masivoPlanta().trim() !== '',
  );

  private reiniciarMasivo(): void {
    this.masivoTipo.set(null);
    this.masivoCubierta.set(null);
    this.masivoPlanta.set('');
  }

  protected leer(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected aplicarMasivo(): void {
    const lista = this.elegidas().filter((c) => c.estado !== 'INACTIVA');
    if (lista.length === 0 || !this.hayCambiosMasivos()) return;

    const cambios: Partial<NuevaCochera> = {};
    const tipo = this.masivoTipo();
    const cubierta = this.masivoCubierta();
    const planta = this.masivoPlanta().trim();
    if (tipo) cambios.tipoVehiculo = tipo;
    if (cubierta !== null) cambios.cubierta = cubierta;
    if (planta) cambios.sector = planta;

    this.ejecutar(
      lista.map((c) => this.cocheras.actualizar(c, cambios)),
      () => {
        this.reiniciarMasivo();
        if (planta) this.plantaElegida.set(planta);
        return `Actualizamos ${lista.length} cocheras.`;
      },
    );
  }

  /* ------------------------------ baja y alta ------------------------------ */

  protected readonly confirmacion = signal<Confirmacion | null>(null);

  protected confirmar(): void {
    const pedido = this.confirmacion();
    this.confirmacion.set(null);
    pedido?.accion();
  }

  protected pedirBaja(): void {
    const lista = this.elegidas().filter((c) => c.estado !== 'INACTIVA');
    if (lista.length === 0) return;

    const nombre = lista.length === 1 ? `la cochera ${lista[0].identificador}` : `${lista.length} cocheras`;
    this.confirmacion.set({
      titulo: lista.length === 1 ? `Dar de baja ${lista[0].identificador}` : `Dar de baja ${lista.length} cocheras`,
      texto: `Vas a dar de baja ${nombre}. No se van a poder reservar y se cancelan sus reservas vigentes. Podés reactivarlas después.`,
      boton: 'Dar de baja',
      accion: () =>
        this.ejecutar(lista.map((c) => this.cocheras.darDeBaja(c)), () => {
          this.seleccion.set([]);
          return lista.length === 1
            ? `La cochera ${lista[0].identificador} quedó dada de baja.`
            : `Dimos de baja ${lista.length} cocheras.`;
        }),
    });
  }

  protected reactivar(cochera: Cochera): void {
    this.ejecutar(
      [this.cocheras.reactivar(cochera)],
      () => `La cochera ${cochera.identificador} volvió a estar activa.`,
    );
  }

  protected pedirEliminacion(cochera: Cochera): void {
    this.confirmacion.set({
      titulo: `Eliminar ${cochera.identificador}`,
      texto:
        'Se borra definitivamente y no se puede deshacer. Solo es posible si la cochera nunca tuvo reservas.',
      boton: 'Eliminar',
      accion: () =>
        this.ejecutar([this.cocheras.eliminar(cochera)], () => {
          this.seleccion.set([]);
          return `La cochera ${cochera.identificador} fue eliminada.`;
        }),
    });
  }

  /* ------------------------ alta por cantidad (modal) ---------------------- */

  protected readonly agregando = signal(false);
  protected readonly sugerencias = SUGERENCIAS_PLANTA;

  protected readonly formularioLotes = this.fb.group({
    lotes: this.fb.array([this.nuevoLote()]),
  });

  protected get lotes() {
    return this.formularioLotes.controls.lotes;
  }

  /** Plantas para los chips del alta: las cargadas primero, despues las sugeridas. */
  protected readonly opcionesPlanta = computed(() => {
    const cargadas = this.nombresPlantas().map((detalle) => ({
      detalle,
      prefijo: this.prefijoDePlanta(detalle),
    }));
    const nombres = new Set(cargadas.map((p) => p.detalle.toLowerCase()));
    return [...cargadas, ...SUGERENCIAS_PLANTA.filter((s) => !nombres.has(s.detalle.toLowerCase()))];
  });

  protected abrirAlta(planta?: string): void {
    this.lotes.clear();
    this.lotes.push(this.nuevoLote());
    const destino = planta ?? this.plantaActiva()?.nombre;
    if (destino && destino !== SIN_PLANTA) {
      this.usarPlanta(0, { detalle: destino, prefijo: this.prefijoDePlanta(destino) });
    }
    this.errorAlta.set(null);
    this.agregando.set(true);
  }

  protected cerrarAlta(): void {
    this.agregando.set(false);
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
   * gris y las nuevas resaltadas. Se muestran hasta 60 lugares por planta.
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

  protected readonly errorAlta = signal<string | null>(null);

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

    this.enviando.set(true);
    this.errorAlta.set(null);

    this.cocheras.crearLote(this.estacionamientoId(), lotes).subscribe({
      next: (creadas) => {
        this.enviando.set(false);
        this.agregando.set(false);
        this.plantaElegida.set(lotes[0].sector);
        this.aviso.set(creadas.length === 1 ? 'Agregamos 1 cochera.' : `Agregamos ${creadas.length} cocheras.`);
        this.recursoCocheras.reload();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.errorAlta.set(e.message);
      },
    });
  }

  /* -------------------------------- comun ---------------------------------- */

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /** Corre uno o varios pedidos juntos, avisa y refresca el plano. */
  private ejecutar(pedidos: Observable<unknown>[], alTerminar: (respuestas: unknown[]) => string): void {
    this.enviando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    forkJoin(pedidos).subscribe({
      next: (respuestas) => {
        this.enviando.set(false);
        this.aviso.set(alTerminar(respuestas));
        this.recursoCocheras.reload();
        this.recursoReservas.reload();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
        this.recursoCocheras.reload();
      },
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
    const numeros = this.recursoCocheras
      .value()
      .map((c) => Number(patron.exec(c.identificador)?.[1] ?? 0));

    const anteriores = this.lotes
      .getRawValue()
      .slice(0, hastaLote)
      .filter((lote) => lote.prefijo.trim().toUpperCase() === prefijo)
      .reduce((suma, lote) => suma + (Number.isInteger(lote.cantidad) ? lote.cantidad : 0), 0);

    return Math.max(0, ...numeros) + anteriores;
  }
}
