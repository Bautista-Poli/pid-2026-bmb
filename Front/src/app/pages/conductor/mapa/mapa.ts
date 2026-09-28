import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Observable, forkJoin, map, of } from 'rxjs';
import { MapaEstacionamientos } from '@app/components/estacionamiento';
import {
  CampoBusqueda,
  Cargando,
  Chip,
  EstadoVacio,
  Icono,
  Modal,
  NombreIcono,
  Sugerencia,
} from '@app/components/ui';
import {
  AreaMapa,
  descripcionVehiculo,
  Estacionamiento,
  FechaISO,
  FiltrosEstacionamiento,
  HoraHHmm,
  Id,
  Momento,
  OrdenEstacionamiento,
  TipoVehiculo,
  Vehiculo,
} from '@app/models';
import {
  EstacionamientoService,
  LIMITE_BUSQUEDA,
  ordenarEstacionamientos,
} from '@app/services/estacionamiento.service';
import { DireccionGeoref, GeorefService, ZonaBusqueda } from '@app/services/georef.service';
import { UbicacionService } from '@app/services/ubicacion.service';
import { VehiculoService } from '@app/services/vehiculo.service';
import {
  ETIQUETA_ESTADO,
  EstadoDisponibilidad,
  estadoDisponibilidad,
  formatearDistancia,
  resumenHorario,
} from '@app/utils/disponibilidad.util';
import { minutosAPie } from '@app/utils/distancia.util';
import { aFechaISO } from '@app/utils/fecha.util';

/** Tope del rango de precios (por hora). En el tope, el maximo no filtra. */
const PRECIO_TOPE = 5000;
const PRECIO_PASO = 100;

/** Tope de horas a reservar en el filtro. */
const HORAS_MAXIMAS = 12;

/** Estacionamientos por pagina en la lista (en el mapa van todos los de la zona). */
const POR_PAGINA = 10;

const ICONO_TIPO: Record<TipoVehiculo, NombreIcono> = {
  AUTO: 'auto',
  CAMIONETA: 'camioneta',
  MOTO: 'moto',
};

/** Sin filtros: ahora, cualquier precio, ordenado por cercania. */
const PANEL_INICIAL: Panel = {
  fecha: aFechaISO(new Date()),
  desde: '',
  horas: 1,
  precioMinimo: 0,
  precioMaximo: PRECIO_TOPE,
  orden: 'DISTANCIA',
  soloCubiertos: false,
};

const CLASE_ESTADO: Record<EstadoDisponibilidad, string> = {
  DISPONIBLE: 'bg-exito-suave text-exito',
  POCA: 'bg-baja/15 text-baja',
  NO_DISPONIBLE: 'bg-humo/15 text-[color-mix(in_srgb,var(--color-ocupada)_55%,var(--color-plomo))]',
};

/** Lo que se edita en el panel de filtros. Se aplica recien con "Aplicar". */
interface Panel {
  fecha: FechaISO;
  /** Vacios: "ahora". */
  desde: HoraHHmm;
  /** Cuantas horas se quiere reservar desde `desde`. */
  horas: number;
  precioMinimo: number;
  precioMaximo: number;
  orden: OrdenEstacionamiento;
  soloCubiertos: boolean;
}

/**
 * Pantalla `/conductor/explorar` · rol CONDUCTOR. Es el inicio del conductor.
 *
 * Buscador, selector de vehiculo, resultados y un mapa con los estacionamientos
 * (color segun disponibilidad). Se muestran los estacionamientos aptos para el
 * tipo del vehiculo elegido; el resto de los filtros va en un modal. Ocupa justo
 * la pantalla: en desktop la columna izquierda scrollea sola y el mapa ocupa el
 * resto; en mobile el mapa va en el medio y la lista abajo, con scroll propio.
 *
 * Las distancias se miden desde la ubicacion del conductor o desde el lugar
 * que elija en el buscador: una zona ("Palermo") o una direccion ("Pueyrredon
 * 2409"). Ese lugar aparece en el mapa como un pin propio y el mapa se centra
 * ahi, para ver que estacionamientos le quedan cerca.
 *
 * Como en Airbnb, se piden solo los estacionamientos de la parte del mapa que
 * se esta viendo: al mover o hacer zoom se vuelven a pedir. La excepcion es la
 * busqueda por nombre (Enter sin elegir sugerencia), que busca en todos lados y
 * encuadra el mapa en lo que encuentra. La lista se muestra de a paginas.
 */
@Component({
  selector: 'app-mapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MapaEstacionamientos, CampoBusqueda, Cargando, Chip, EstadoVacio, Icono, Modal],
  templateUrl: './mapa.html',
  host: { class: 'flex min-h-0 flex-1 flex-col' },
})
export class Mapa {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly vehiculos = inject(VehiculoService);
  private readonly georef = inject(GeorefService);
  private readonly ubicacion = inject(UbicacionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly descripcion = descripcionVehiculo;
  protected readonly iconoTipo = ICONO_TIPO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO;
  protected readonly claseEstado = CLASE_ESTADO;
  protected readonly precioTope = PRECIO_TOPE;
  protected readonly precioPaso = PRECIO_PASO;
  protected readonly horasMaximas = HORAS_MAXIMAS;
  protected readonly hoy = aFechaISO(new Date());

  /* -------------------------------- Vehiculo ------------------------------- */

  protected readonly vehiculosDelConductor = rxResource({
    stream: () => this.vehiculos.listarMisVehiculos(),
    defaultValue: [] as Vehiculo[],
  });

  /** Posicion del vehiculo elegido. Arranca en el predeterminado cuando llega la lista. */
  protected readonly indiceVehiculo = linkedSignal<number>(() => {
    const indice = this.vehiculosDelConductor.value().findIndex((v) => v.predeterminado);
    return indice >= 0 ? indice : 0;
  });

  protected readonly vehiculoActual = computed<Vehiculo | null>(
    () => this.vehiculosDelConductor.value()[this.indiceVehiculo()] ?? null,
  );

  /** Anterior/siguiente vehiculo, ciclico. Sin efecto con 0 o 1 vehiculo. */
  protected vehiculoAnterior(): void {
    const total = this.vehiculosDelConductor.value().length;
    if (total < 2) return;
    this.indiceVehiculo.update((i) => (i - 1 + total) % total);
  }

  protected vehiculoSiguiente(): void {
    const total = this.vehiculosDelConductor.value().length;
    if (total < 2) return;
    this.indiceVehiculo.update((i) => (i + 1) % total);
  }

  /* --------------------------------- Filtros -------------------------------- */

  /** Borrador del modal de filtros. */
  protected readonly panel = signal<Panel>(PANEL_INICIAL);
  /** Los filtros en uso. */
  private readonly aplicado = signal<Panel>(PANEL_INICIAL);

  protected readonly filtrosAbiertos = signal(false);
  protected readonly intentoBuscar = signal(false);

  /** Cuantos filtros del modal estan en uso (el orden no cuenta: tiene su propio selector). */
  protected readonly filtrosActivos = computed(() => {
    const { desde, precioMinimo, precioMaximo, soloCubiertos } = this.aplicado();
    return [desde, precioMinimo > 0 || precioMaximo < PRECIO_TOPE, soloCubiertos].filter(Boolean)
      .length;
  });

  protected readonly errorHorario = computed(() => {
    const { fecha, desde, horas } = this.panel();
    if (!desde) return null;
    if (!fecha || fecha < this.hoy) return 'Elegí una fecha desde hoy.';
    if (!horaFin(desde, horas)) return 'La reserva tiene que terminar antes de la medianoche. Probá con menos horas.';
    return null;
  });

  protected readonly textoPrecio = computed(() => {
    const { precioMinimo, precioMaximo } = this.panel();
    const maximo = precioMaximo >= PRECIO_TOPE ? `${pesos(PRECIO_TOPE)}+` : pesos(precioMaximo);
    return `${pesos(precioMinimo)} - ${maximo}`;
  });

  protected cambiar(cambios: Partial<Panel>): void {
    this.panel.update((actual) => ({ ...actual, ...cambios }));
  }

  /** Horas a reservar: entre 1 y `HORAS_MAXIMAS`. */
  protected cambiarHoras(delta: number): void {
    const horas = Math.min(Math.max(this.panel().horas + delta, 1), HORAS_MAXIMAS);
    this.cambiar({ horas });
  }

  /** "Hasta las 14:30", para que se vea cuando termina la reserva. */
  protected readonly textoFin = computed(() => {
    const { desde, horas } = this.panel();
    const fin = desde ? horaFin(desde, horas) : null;
    return fin ? `Hasta las ${fin}` : null;
  });

  /** Los dos extremos del rango no se cruzan: el que se mueve empuja hasta el otro. */
  protected moverMinimo(valor: string): void {
    this.cambiar({ precioMinimo: Math.min(Number(valor), this.panel().precioMaximo - PRECIO_PASO) });
  }

  protected moverMaximo(valor: string): void {
    this.cambiar({ precioMaximo: Math.max(Number(valor), this.panel().precioMinimo + PRECIO_PASO) });
  }

  /** El modal arranca con lo que esta en uso: si se cierra sin aplicar, no cambia nada. */
  protected abrirFiltros(): void {
    this.panel.set({ ...this.aplicado(), orden: this.orden() });
    this.intentoBuscar.set(false);
    this.filtrosAbiertos.set(true);
  }

  protected aplicarFiltros(): void {
    this.intentoBuscar.set(true);
    if (this.errorHorario()) return;
    this.aplicado.set(this.panel());
    this.orden.set(this.panel().orden);
    this.filtrosAbiertos.set(false);
  }

  protected limpiarFiltros(): void {
    const limpio = { ...PANEL_INICIAL, orden: this.orden() };
    this.panel.set(limpio);
    this.aplicado.set(limpio);
    this.intentoBuscar.set(false);
    this.filtrosAbiertos.set(false);
  }

  /**
   * "Ordenar por" de los resultados: se aplica al toque. No toca `aplicado`, asi
   * que no vuelve a pedir al backend: solo reordena lo que ya llego.
   */
  protected ordenar(orden: string): void {
    const valor = orden as OrdenEstacionamiento;
    this.cambiar({ orden: valor });
    this.orden.set(valor);
  }

  /* -------------------------- Buscador y ubicacion ------------------------- */

  /** Lo escrito en el buscador. Sin elegir una sugerencia, filtra por nombre o zona. */
  protected readonly texto = signal('');
  private readonly textoAplicado = signal('');
  /** Zona o direccion elegida de las sugerencias: las distancias se miden desde ahi. */
  protected readonly destino = signal<DireccionGeoref | null>(null);

  protected escribir(texto: string): void {
    this.texto.set(texto);
    this.destino.set(null);
    if (!texto.trim()) this.textoAplicado.set('');
  }

  /** Enter sin elegir una sugerencia: filtra por nombre o zona. */
  protected buscarTexto(): void {
    this.textoAplicado.set(this.destino() ? '' : this.texto().trim());
  }

  protected elegirDestino(sugerencia: Sugerencia): void {
    const destino = sugerencia.dato as DireccionGeoref;
    this.destino.set(destino);
    this.texto.set(destino.nombre);
    this.textoAplicado.set('');
  }

  protected usarMiUbicacion(): void {
    this.destino.set(null);
    this.texto.set('');
    this.textoAplicado.set('');
    this.ubicacion.solicitar();
  }

  /** Donde esta el conductor (el punto azul del mapa). */
  protected readonly ubicacionActual = this.ubicacion.posicion;

  /** Desde donde se miden las distancias. */
  protected readonly origen = computed(
    () => this.destino()?.coordenadas ?? this.ubicacion.posicion(),
  );
  protected readonly tituloOrigen = computed(() => (this.destino() ? 'Tu destino' : 'Tu ubicación'));
  protected readonly detalleOrigen = computed(() => {
    const destino = this.destino();
    return destino ? `${destino.nombre}, ${destino.detalle}` : null;
  });

  protected readonly sinOrigen = computed(() => {
    const estado = this.ubicacion.estado();
    return !this.destino() && (estado === 'denegada' || estado === 'no-disponible');
  });

  /**
   * Todos los estacionamientos publicados: de ahi salen las ciudades donde
   * buscar direcciones (sin acotar, Georef devuelve la misma altura en decenas
   * de ciudades del pais).
   */
  private readonly todos = rxResource({
    stream: () => this.estacionamientos.listar({}),
    defaultValue: [] as Estacionamiento[],
  });

  private readonly zonas = computed<ZonaBusqueda[]>(() => {
    const vistas = new Map<string, ZonaBusqueda>();
    for (const { direccion } of this.todos.value()) {
      if (!direccion.ciudad || !direccion.provincia) continue;
      vistas.set(`${direccion.ciudad}|${direccion.provincia}`, {
        ciudad: direccion.ciudad,
        provincia: direccion.provincia,
      });
    }
    return [...vistas.values()];
  });

  /**
   * Sugerencias del buscador: zonas ("Palermo") y, si lo escrito tiene altura,
   * direcciones ("Pueyrredon 2409"). Las dos traen coordenadas para centrar el
   * mapa. Se busca solo donde hay estacionamientos.
   */
  protected readonly buscarDirecciones = (texto: string): Observable<Sugerencia[]> => {
    const zonas = this.zonas();
    const provincias = [...new Set(zonas.map((zona) => zona.provincia))];
    const direcciones$ = /\d/.test(texto) ? this.georef.buscarDestinos(texto, zonas) : of([]);
    return forkJoin([direcciones$, this.georef.buscarZonas(texto, provincias)]).pipe(
      map(([direcciones, barrios]) =>
        [...direcciones, ...barrios].map((d) => ({ nombre: d.nombre, detalle: d.detalle, dato: d })),
      ),
    );
  };

  /* ------------------------------- Resultados ------------------------------ */

  /** La parte del mapa que se esta viendo. `null` hasta que el mapa se crea. */
  private readonly area = signal<AreaMapa | null>(null);

  /** Buscando por nombre: en todo el mapa, sin importar la zona visible. */
  protected readonly buscandoPorNombre = computed(() => this.textoAplicado() !== '');

  protected moverMapa(area: AreaMapa): void {
    this.area.set(area);
  }

  /** `undefined` (no pide nada) hasta saber que zona se ve. */
  private readonly consulta = computed<FiltrosEstacionamiento | undefined>(() => {
    const panel = this.aplicado();
    const porNombre = this.buscandoPorNombre();
    const area = this.area();
    if (!porNombre && !area) return undefined;
    return {
      busqueda: this.textoAplicado(),
      area: porNombre ? null : area,
      // Sin vehiculos cargados se muestran los aptos para auto.
      tipoVehiculo: this.vehiculoActual()?.tipo ?? 'AUTO',
      precioMinimo: panel.precioMinimo > 0 ? panel.precioMinimo : null,
      precioMaximo: panel.precioMaximo < PRECIO_TOPE ? panel.precioMaximo : null,
      soloCubiertos: panel.soloCubiertos,
      momento: momentoDe(panel),
      // Los que no sirven tambien se muestran (en gris y al final), no desaparecen.
      incluirNoDisponibles: true,
      origen: this.origen(),
    };
  });

  protected readonly recurso = rxResource({
    params: () => this.consulta(),
    stream: ({ params }) => this.estacionamientos.listar(params),
    defaultValue: [] as Estacionamiento[],
  });

  /**
   * Lo ultimo que llego. Mientras se piden los de otra zona se siguen mostrando
   * los anteriores, para que los pines y la lista no parpadeen al mover el mapa.
   */
  private readonly ultimosRecibidos = linkedSignal<Estacionamiento[] | undefined, Estacionamiento[]>({
    source: () => (this.recurso.hasValue() && !this.recurso.isLoading() ? this.recurso.value() : undefined),
    computation: (recibidos, anterior) => recibidos ?? anterior?.value ?? [],
  });

  /** Hasta que llega la primera respuesta se muestra el esqueleto de carga. */
  protected readonly cargandoPrimeraVez = computed(
    () => this.ultimosRecibidos().length === 0 && (this.recurso.isLoading() || !this.area()),
  );

  /** Llego el tope de la API: puede haber mas en la zona, hay que acercar el mapa. */
  protected readonly hayMasEnLaZona = computed(
    () => !this.buscandoPorNombre() && this.ultimosRecibidos().length >= LIMITE_BUSQUEDA,
  );

  /** El orden se resuelve en el front: cambiarlo no pide nada al backend. */
  protected readonly orden = signal<OrdenEstacionamiento>(PANEL_INICIAL.orden);
  protected readonly resultados = computed(() =>
    ordenarEstacionamientos(this.ultimosRecibidos(), this.orden()),
  );

  /* -------------------------------- Paginas -------------------------------- */

  /** Pagina de la lista (desde 0). Vuelve a la primera cuando cambian los resultados. */
  protected readonly pagina = linkedSignal<Estacionamiento[], number>({
    source: this.resultados,
    computation: () => 0,
  });

  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.resultados().length / POR_PAGINA)),
  );

  protected readonly resultadosPagina = computed(() => {
    const desde = this.pagina() * POR_PAGINA;
    return this.resultados().slice(desde, desde + POR_PAGINA);
  });

  protected irAPagina(pagina: number): void {
    this.pagina.set(Math.min(Math.max(pagina, 0), this.totalPaginas() - 1));
    this.lista()?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');

  /** El que se toco en el mapa o sobre el que esta el mouse en la lista. */
  protected readonly seleccionadoId = signal<Id | null>(null);

  /** Si el pin tocado esta en otra pagina de la lista, va a esa pagina. */
  protected seleccionarDesdeMapa(id: Id): void {
    this.seleccionadoId.set(id);
    const posicion = this.resultados().findIndex((e) => e.id === id);
    if (posicion >= 0) this.pagina.set(Math.floor(posicion / POR_PAGINA));
    afterNextRender(
      () =>
        document
          .getElementById(`estacionamiento-${id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      { injector: this.injector },
    );
  }

  protected irAReservar(estacionamiento: Estacionamiento): void {
    void this.router.navigate(['/conductor/reservar', estacionamiento.id]);
  }

  /* ---------------------------- Datos de la tarjeta ------------------------ */

  protected estado(estacionamiento: Estacionamiento): EstadoDisponibilidad {
    return estadoDisponibilidad(estacionamiento);
  }

  /** "350 m · 5 min a pie" */
  protected distancia(estacionamiento: Estacionamiento): string | null {
    const km = estacionamiento.distanciaKm;
    if (km == null) return null;
    return `${formatearDistancia(km)} · ${minutosAPie(km)} min a pie`;
  }

  /** "$1.200/h"; si no cobra por hora, la estadia o la jornada. */
  protected precio(estacionamiento: Estacionamiento): string {
    const { hora, estadia, jornada } = estacionamiento.tarifas;
    if (hora != null) return `${pesos(hora)}/h`;
    if (estadia != null) return `${pesos(estadia)} estadía`;
    if (jornada != null) return `${pesos(jornada)} jornada`;
    return '';
  }

  protected horario(estacionamiento: Estacionamiento): string {
    return resumenHorario(estacionamiento.horarios);
  }

  constructor() {
    this.ubicacion.solicitar();
  }
}

function momentoDe(panel: Panel): Momento {
  const hasta = panel.desde ? horaFin(panel.desde, panel.horas) : null;
  if (!panel.desde || !hasta) return { tipo: 'AHORA' };
  return { tipo: 'FRANJA', fecha: panel.fecha, horaDesde: panel.desde, horaHasta: hasta };
}

/**
 * "HH:mm" de fin sumando `horas` al inicio. `null` si pasa de la medianoche:
 * la reserva tiene que empezar y terminar el mismo dia.
 */
function horaFin(desde: HoraHHmm, horas: number): HoraHHmm | null {
  const [h, m] = desde.split(':').map(Number);
  const minutos = h * 60 + m + horas * 60;
  if (minutos > 24 * 60 - 1) return null;
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

function pesos(monto: number): string {
  return `$${monto.toLocaleString('es-AR')}`;
}
