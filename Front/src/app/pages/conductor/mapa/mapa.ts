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
import { Observable, of } from 'rxjs';
import {
  InsigniasEstacionamiento,
  MapaEstacionamientos,
  NivelEstacionamiento,
} from '@app/components/estacionamiento';
import { Cargando, EstadoVacio, Icono } from '@app/components/ui';
import {
  AreaMapa,
  descripcionVehiculo,
  Estacionamiento,
  FiltrosEstacionamiento,
  ICONO_TIPO_VEHICULO,
  Id,
  Momento,
  OrdenEstacionamiento,
  Vehiculo,
} from '@app/models';
import {
  EstacionamientoService,
  LIMITE_BUSQUEDA,
  ordenarEstacionamientos,
} from '@app/services/estacionamiento.service';
import { Destino } from '@app/utils/direcciones.util';
import { buscarDestinosLocales } from '@app/utils/destinos-locales.util';
import { CampoBusqueda, Sugerencia } from './campo-busqueda/campo-busqueda';
import { DetalleEstacionamiento } from './detalle-estacionamiento/detalle-estacionamiento';
import { ModalFiltros } from './modal-filtros/modal-filtros';
import { Panel, horaFin, pesos } from './panel';
import {
  CLASE_ESTADO,
  ICONO_LUGAR,
  MAX_SUGERENCIAS,
  ORDENES,
  PANEL_INICIAL,
  POR_PAGINA,
  PRECIO_TOPE,
} from './constantes';
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
import { diaCorto } from '@app/utils/fecha.util';

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
  imports: [
    RouterLink,
    MapaEstacionamientos,
    DetalleEstacionamiento,
    InsigniasEstacionamiento,
    NivelEstacionamiento,
    CampoBusqueda,
    Cargando,
    EstadoVacio,
    Icono,
    ModalFiltros,
  ],
  templateUrl: './mapa.html',
  styleUrl: './mapa.css',
  host: { class: 'flex min-h-0 flex-1 flex-col' },
})
export class Mapa {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly vehiculos = inject(VehiculoService);
  private readonly ubicacion = inject(UbicacionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly descripcion = descripcionVehiculo;
  protected readonly iconoTipo = ICONO_TIPO_VEHICULO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO;
  protected readonly claseEstado = CLASE_ESTADO;

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

  protected readonly ordenes = ORDENES;
  /** Los filtros en uso. */
  private readonly aplicado = signal<Panel>(PANEL_INICIAL);

  /** Con que filtros se abre el modal (ver modal-filtros/). */
  protected readonly panelInicial = signal<Panel>(PANEL_INICIAL);
  protected readonly filtrosAbiertos = signal(false);

  /** Cuantos filtros del modal estan en uso (el orden no cuenta: tiene su propio selector). */
  protected readonly filtrosActivos = computed(() => {
    const { desde, precioMinimo, precioMaximo, soloCubiertos, nivelMinimo } = this.aplicado();
    return [desde, precioMinimo > 0 || precioMaximo < PRECIO_TOPE, soloCubiertos, nivelMinimo].filter(
      Boolean,
    ).length;
  });

  /** El modal arranca con lo que esta en uso: si se cierra sin aplicar, no cambia nada. */
  protected abrirFiltros(): void {
    this.panelInicial.set({ ...this.aplicado(), orden: this.orden() });
    this.filtrosAbiertos.set(true);
  }

  /** El modal ya valido el horario: se aplican los filtros y se cierra. */
  protected aplicarFiltros(panel: Panel): void {
    this.aplicado.set(panel);
    this.orden.set(panel.orden);
    this.filtrosAbiertos.set(false);
  }

  /** Vuelve los filtros a los iniciales (sin tocar el orden). */
  protected limpiarFiltros(): void {
    const limpio = { ...PANEL_INICIAL, orden: this.orden() };
    this.panelInicial.set(limpio);
    this.aplicado.set(limpio);
    this.filtrosAbiertos.set(false);
  }

  /**
   * "Ordenar por" de los resultados: se aplica al toque. No toca `aplicado`, asi
   * que no vuelve a pedir al backend: solo reordena lo que ya llego.
   */
  protected ordenar(orden: string): void {
    this.orden.set(orden as OrdenEstacionamiento);
  }

  /* -------------------------- Buscador y ubicacion ------------------------- */

  /** Lo escrito en el buscador. Sin elegir una sugerencia, filtra por nombre o zona. */
  protected readonly texto = signal('');
  private readonly textoAplicado = signal('');
  /** Zona o direccion elegida de las sugerencias: las distancias se miden desde ahi. */
  protected readonly destino = signal<Destino | null>(null);

  protected escribir(texto: string): void {
    this.texto.set(texto);
    this.destino.set(null);
    if (!texto.trim()) this.textoAplicado.set('');
  }

  /** Enter sin elegir una sugerencia: filtra por nombre o zona. */
  protected buscarTexto(): void {
    this.textoAplicado.set(this.destino() ? '' : this.texto().trim());
  }

  /** Centra la busqueda en el lugar elegido. */
  protected elegirDestino(sugerencia: Sugerencia): void {
    const destino = sugerencia.dato as Destino;
    this.destino.set(destino);
    this.texto.set(destino.nombre);
    this.textoAplicado.set('');
  }

  /** Centra la busqueda en la ubicacion del usuario. */
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

  /** Todos los estacionamientos publicados: el buscador sugiere sus barrios y nombres. */
  private readonly todos = rxResource({
    stream: () => this.estacionamientos.listar({}),
    defaultValue: [] as Estacionamiento[],
  });

  /**
   * Sugerencias del buscador (desde la 3ra letra): los barrios y los
   * estacionamientos que ya estan en la base (buscarDestinosLocales).
   */
  protected readonly buscarDirecciones = (texto: string): Observable<Sugerencia[]> =>
    of(
      buscarDestinosLocales(texto, this.todos.value())
        .slice(0, MAX_SUGERENCIAS)
        .map((lugar) => ({
          nombre: lugar.nombre,
          detalle: lugar.detalle,
          dato: lugar,
          icono: ICONO_LUGAR[lugar.tipo ?? 'lugar'],
        })),
    );

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
      nivelMinimo: panel.nivelMinimo,
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

  /** El que tiene abierta la ficha con el boton de reservar. */
  private readonly abiertoId = signal<Id | null>(null);
  protected readonly abierto = computed(
    () => this.resultados().find((e) => e.id === this.abiertoId()) ?? null,
  );

  /** "Ahora" o "Sáb 3 oct · 10:00 – 14:00": para cuando se busco. */
  protected readonly cuando = computed(() => {
    const { fecha, desde, horas } = this.aplicado();
    const hasta = desde ? horaFin(desde, horas) : null;
    if (!desde || !hasta) return 'Ahora';
    return `${diaCorto(fecha)} · ${desde} – ${hasta}`;
  });

  /** Tocar una tarjeta de la lista abre su ficha. */
  protected abrir(estacionamiento: Estacionamiento): void {
    this.seleccionadoId.set(estacionamiento.id);
    this.abiertoId.set(estacionamiento.id);
  }

  protected cerrarDetalle(): void {
    this.abiertoId.set(null);
  }

  /**
   * Tocar un pin abre su ficha. Si en la lista esta en otra pagina, va a esa
   * pagina y la tarjeta queda a la vista.
   */
  protected seleccionarDesdeMapa(id: Id): void {
    this.seleccionadoId.set(id);
    this.abiertoId.set(id);
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
