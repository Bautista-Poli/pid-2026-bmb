import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, linkedSignal, signal, viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MapaEstacionamientos } from '@app/components/estacionamiento';
import { SelectorVehiculo } from '@app/components/vehiculo';
import { Cargando, EstadoVacio, Icono } from '@app/components/ui';
import { AreaMapa, Estacionamiento, FiltrosEstacionamiento, Id, Momento, OrdenEstacionamiento, Vehiculo,
} from '@app/models';

import { EstacionamientoService, LIMITE_BUSQUEDA, ordenarEstacionamientos,
} from '@app/services/estacionamiento.service';

import { Destino } from '@app/utils/direcciones.util';
import { DetalleEstacionamiento } from './detalle-estacionamiento/detalle-estacionamiento';
import { Filtros } from './filtros/filtros';
import { ResultadoEstacionamiento } from './resultado-estacionamiento/resultado-estacionamiento';
import { Busqueda, BuscadorDestino, SIN_BUSQUEDA } from './buscador-destino/buscador-destino';
import { Panel, horaFin } from './panel.interface';
import { ORDENES, PANEL_INICIAL, POR_PAGINA, PRECIO_TOPE } from './constantes';

import { UbicacionService } from '@app/services/conductor/ubicacion.service';

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
    MapaEstacionamientos,
    DetalleEstacionamiento,
    Cargando,
    EstadoVacio,
    Icono,
    BuscadorDestino,
    SelectorVehiculo,
    Filtros,
    ResultadoEstacionamiento,
  ],
  templateUrl: './mapa.html',
  styleUrl: './mapa.css',
  host: { class: 'flex min-h-0 flex-1 flex-col' },
})
export class Mapa {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly ubicacion = inject(UbicacionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);


  /* ------------------- Lo que elige el conductor en el panel ------------------ */

  /** Lo buscado (buscador-destino/). */
  protected readonly busqueda = signal<Busqueda>(SIN_BUSQUEDA);
  /** Vehiculo elegido (selector-vehiculo/); `null` si el conductor no cargo ninguno. */
  protected readonly vehiculo = signal<Vehiculo | null>(null);
  /** Los filtros en uso (filtros/). */
  protected readonly filtros = signal<Panel>(PANEL_INICIAL);

  /** Zona o direccion elegida de las sugerencias: las distancias se miden desde ahi. */
  protected readonly destino = computed(() => this.busqueda().destino);
  /** Texto buscado con Enter, sin elegir sugerencia: filtra por nombre o zona. */
  private readonly textoAplicado = computed(() => this.busqueda().nombre);

  /* --------------------------------- Ubicacion ------------------------------- */

  /** El boton del mapa: vuelve a buscar alrededor del conductor. */
  protected usarMiUbicacion(): void {
    this.busqueda.set(SIN_BUSQUEDA);
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
    const panel = this.filtros();
    const porNombre = this.buscandoPorNombre();
    const area = this.area();
    if (!porNombre && !area) return undefined;
    return {
      busqueda: this.textoAplicado(),
      area: porNombre ? null : area,
      // Sin vehiculos cargados se muestran los aptos para auto.
      tipoVehiculo: this.vehiculo()?.tipo ?? 'AUTO',
      precioMinimo: panel.precioMinimo > 0 ? panel.precioMinimo : null,
      precioMaximo: panel.precioMaximo < PRECIO_TOPE ? panel.precioMaximo : null,
      soloCubiertos: panel.soloCubiertos,
      nivelMinimo: panel.nivelMinimo,
      momento: momentoDe(panel),
      // Los que no sirven tambien se muestran (en gris y al final), no desaparecen.
      incluirNoDisponibles: true,
      origen: this.origen(),
    };
    // Cambiar solo el orden (que va en los mismos filtros) no vuelve a pedir nada.
  }, { equal: mismaConsulta });

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
  protected readonly ordenes = ORDENES;
  protected readonly orden = computed(() => this.filtros().orden);

  /** "Ordenar por" de la lista: se aplica al toque y solo reordena lo que ya llego. */
  protected ordenar(orden: string): void {
    this.filtros.update((filtros) => ({ ...filtros, orden: orden as OrdenEstacionamiento }));
  }

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
    const { fecha, desde, horas } = this.filtros();
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

  constructor() {
    this.ubicacion.solicitar();
  }
}

/** Dos consultas piden lo mismo si todos sus datos coinciden. */
function mismaConsulta(a: FiltrosEstacionamiento | undefined, b: FiltrosEstacionamiento | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function momentoDe(panel: Panel): Momento {
  const hasta = panel.desde ? horaFin(panel.desde, panel.horas) : null;
  if (!panel.desde || !hasta) return { tipo: 'AHORA' };
  return { tipo: 'FRANJA', fecha: panel.fecha, horaDesde: panel.desde, horaHasta: hasta };
}
