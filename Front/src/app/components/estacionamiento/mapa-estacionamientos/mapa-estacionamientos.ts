import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { Icono } from '@app/components/ui';
import { AreaMapa, Estacionamiento, Id } from '@app/models';
import { TemaService } from '@app/services/tema.service';
import { EstadoDisponibilidad, estadoDisponibilidad } from '@app/utils/disponibilidad.util';
import { Coordenadas } from '@app/utils/distancia.util';
import { environment } from '../../../../environments/environment';

/** Obelisco: donde arranca el mapa si todavia no hay nada para mostrar. */
const CENTRO_INICIAL: L.LatLngTuple = [-34.6037, -58.3816];

/** Zoom al centrarse en un lugar buscado: unas 10 cuadras a la redonda. */
const ZOOM_DESTINO = 15;

/** Zoom al centrarse en el conductor: un poco mas abierto, para ver opciones alrededor. */
const ZOOM_UBICACION = 14;

const CLAVE_CARTO = environment.mapa.claveCarto;
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Mosaicos de CARTO (datos de OpenStreetMap): "Voyager" de dia y "Dark Matter"
 * de noche. Necesitan la clave de `environments/environment.ts`; sin clave el
 * mapa usa los mosaicos de OpenStreetMap, apagados y oscurecidos con un filtro
 * CSS (`.mapa-osm` en styles.css).
 * `{r}` pide la version de alta resolucion en pantallas retina.
 */
const MOSAICOS = CLAVE_CARTO
  ? {
      claro: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CLAVE_CARTO}`,
      oscuro: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CLAVE_CARTO}`,
    }
  : { claro: OSM, oscuro: OSM };

const ATRIBUCION = CLAVE_CARTO
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const CLASE_ESTADO: Record<EstadoDisponibilidad, string> = {
  DISPONIBLE: 'pin--disponible',
  POCA: 'pin--poca',
  NO_DISPONIBLE: 'pin--no-disponible',
};

/**
 * Mapa de estacionamientos (Leaflet + OpenStreetMap).
 *
 * Cada estacionamiento con coordenadas es un pin con su precio por hora, del
 * color de su disponibilidad (el mismo que la leyenda). Tocar un pin emite
 * `seleccionar`; el elegido se destaca.
 *
 * La ubicacion del conductor es el punto azul. El lugar que busco (una
 * direccion o una zona) es un pin propio, solo visual: al buscarlo el mapa se
 * centra ahi, para que se vea que estacionamientos le quedan cerca.
 *
 * Cada vez que se termina de mover o hacer zoom emite `moverMapa` con el area
 * visible, para que quien lo usa pida solo los estacionamientos de esa zona.
 * El mapa no se reencuadra solo cuando cambian los resultados (respeta donde lo
 * dejo el conductor), salvo con `encuadrarResultados`.
 */
@Component({
  selector: 'app-mapa-estacionamientos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  template: `
    <div #contenedor class="absolute inset-0"></div>

    <!-- Leyenda -->
    <ul
      class="pointer-events-none absolute top-4 right-4 z-[500] hidden items-center gap-4 rounded-full
             border border-borde bg-papel/95 px-4 py-2 text-[12px] font-medium text-grafito
             shadow-elevada sm:flex"
    >
      <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-exito"></span>Disponible</li>
      <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-baja"></span>Poca disponibilidad</li>
      <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-ocupada)_45%,var(--color-humo))]"></span>No disponible</li>
    </ul>

    <!-- Zoom y volver al origen -->
    <div class="absolute right-4 bottom-8 z-[500] flex flex-col gap-2.5">
      <div class="flex flex-col overflow-hidden rounded-control border border-borde bg-papel shadow-elevada">
        <button type="button" class="control-mapa" aria-label="Acercar" (click)="acercar()">
          <ui-icono nombre="mas" [tamano]="18" />
        </button>
        <span class="h-px bg-borde"></span>
        <button type="button" class="control-mapa" aria-label="Alejar" (click)="alejar()">
          <ui-icono nombre="menos" [tamano]="18" />
        </button>
      </div>
      <button
        type="button"
        class="control-mapa rounded-control border border-borde bg-papel shadow-elevada"
        aria-label="Centrar en mi ubicación"
        (click)="centrarEnOrigen()"
      >
        <ui-icono nombre="ubicar" [tamano]="18" />
      </button>
    </div>

    <!-- Desde donde se mide -->
    @if (destino() || ubicacion()) {
      <button
        type="button"
        class="absolute bottom-8 left-4 z-[500] flex max-w-[calc(100%-6rem)] items-center gap-2.5
               rounded-control border border-borde bg-papel px-3.5 py-2.5 text-left shadow-elevada"
        (click)="centrarEnOrigen()"
      >
        @if (destino()) {
          <span class="size-2.5 shrink-0 rounded-full bg-tinta ring-4 ring-tinta/15"></span>
        } @else {
          <span class="size-2.5 shrink-0 rounded-full bg-[#2563eb] ring-4 ring-[#2563eb]/20"></span>
        }
        <span class="min-w-0">
          <span class="block text-[12.5px] font-semibold text-tinta">{{ tituloOrigen() }}</span>
          @if (detalleOrigen()) {
            <span class="block truncate text-[11.5px] text-plomo">{{ detalleOrigen() }}</span>
          }
        </span>
      </button>
    }
  `,
  host: {
    class: 'relative block overflow-hidden',
    // Solo sin clave de CARTO: el filtro que apaga (y oscurece) los mosaicos de OSM.
    '[class.mapa-osm]': '!usaCarto',
    '[class.mapa-osm--oscuro]': '!usaCarto && tema.esOscuro()',
  },
})
export class MapaEstacionamientos {
  protected readonly tema = inject(TemaService);
  protected readonly usaCarto = Boolean(CLAVE_CARTO);

  readonly estacionamientos = input.required<Estacionamiento[]>();
  /** Donde esta el conductor (punto azul). */
  readonly ubicacion = input<Coordenadas | null>(null);
  /** El lugar que busco (pin de destino, no se puede tocar). Al cambiar, el mapa se centra ahi. */
  readonly destino = input<Coordenadas | null>(null);
  readonly tituloOrigen = input('Tu ubicación');
  readonly detalleOrigen = input<string | null>(null);
  readonly seleccionadoId = input<Id | null>(null);
  /** Encuadra los resultados cada vez que cambian (p. ej. al buscar por nombre en todo el mapa). */
  readonly encuadrarResultados = input(false);

  readonly seleccionar = output<Id>();
  /** Se toca "centrar" sin ubicacion ni destino: quien usa el mapa puede pedir la ubicacion. */
  readonly pedirUbicacion = output<void>();
  /** El area visible, al crearse el mapa y cada vez que se termina de mover o hacer zoom. */
  readonly moverMapa = output<AreaMapa>();

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private readonly listo = signal(false);

  private mapa?: L.Map;
  private mosaicos?: L.TileLayer;
  private readonly capaPines = L.layerGroup();
  private marcadorUbicacion?: L.Marker;
  private marcadorDestino?: L.Marker;
  private observador?: ResizeObserver;
  /** Para mover el mapa solo cuando cambian, no al seleccionar un pin. */
  private ultimosResultados?: Estacionamiento[];
  private ultimaUbicacion?: Coordenadas | null;
  private ultimoDestino?: Coordenadas | null;

  constructor() {
    afterNextRender(() => {
      this.crearMapa();
      this.listo.set(true);
    });

    inject(DestroyRef).onDestroy(() => {
      this.observador?.disconnect();
      this.mapa?.remove();
    });

    // Pines: se redibujan con los resultados y con la seleccion.
    effect(() => {
      if (!this.listo()) return;
      const estacionamientos = this.estacionamientos();
      const seleccionado = this.seleccionadoId();
      const ubicacion = this.ubicacion();
      const destino = this.destino();
      untracked(() => this.dibujar(estacionamientos, seleccionado, ubicacion, destino));
    });

    // Mosaicos claros u oscuros segun el tema de la app.
    effect(() => {
      if (!this.listo()) return;
      const url = this.tema.esOscuro() ? MOSAICOS.oscuro : MOSAICOS.claro;
      untracked(() => this.mosaicos?.setUrl(url));
    });
  }

  protected acercar(): void {
    this.mapa?.zoomIn();
  }

  protected alejar(): void {
    this.mapa?.zoomOut();
  }

  /** Centra en el destino buscado o, si no hay, en la ubicacion del conductor. */
  protected centrarEnOrigen(): void {
    const punto = this.destino() ?? this.ubicacion();
    if (!punto) {
      this.pedirUbicacion.emit();
      return;
    }
    this.mapa?.flyTo([punto.latitud, punto.longitud], Math.max(this.mapa.getZoom(), ZOOM_DESTINO));
  }

  private crearMapa(): void {
    const elemento = this.contenedor().nativeElement;
    this.mapa = L.map(elemento, { zoomControl: false, attributionControl: true }).setView(
      CENTRO_INICIAL,
      13,
    );
    this.mosaicos = L.tileLayer(this.tema.esOscuro() ? MOSAICOS.oscuro : MOSAICOS.claro, {
      attribution: ATRIBUCION,
      maxZoom: CLAVE_CARTO ? 20 : 19,
    }).addTo(this.mapa);
    this.capaPines.addTo(this.mapa);

    const mapa = this.mapa;
    mapa.on('moveend', () => this.moverMapa.emit(areaDe(mapa)));
    this.moverMapa.emit(areaDe(mapa));

    // El contenedor cambia de alto (panel plegable en mobile, ventana): Leaflet
    // tiene que enterarse para no dejar franjas grises.
    this.observador = new ResizeObserver(() => this.mapa?.invalidateSize());
    this.observador.observe(elemento);
  }

  private dibujar(
    estacionamientos: Estacionamiento[],
    seleccionado: Id | null,
    ubicacion: Coordenadas | null,
    destino: Coordenadas | null,
  ): void {
    const mapa = this.mapa;
    if (!mapa) return;

    this.capaPines.clearLayers();
    const puntos: L.LatLngTuple[] = [];

    for (const estacionamiento of estacionamientos) {
      const { latitud, longitud } = estacionamiento.direccion;
      if (latitud == null || longitud == null) continue;

      const activo = estacionamiento.id === seleccionado;
      const pin = L.marker([latitud, longitud], {
        icon: iconoPin(estacionamiento, activo),
        title: estacionamiento.nombre,
        riseOnHover: true,
        // Los no disponibles quedan debajo: si se pisan, se ve el que sirve.
        zIndexOffset: activo ? 1000 : estadoDisponibilidad(estacionamiento) === 'NO_DISPONIBLE' ? -500 : 0,
      });
      pin.on('click', () => this.seleccionar.emit(estacionamiento.id));
      this.capaPines.addLayer(pin);
      puntos.push([latitud, longitud]);
    }

    this.marcadorUbicacion = moverMarcador(this.marcadorUbicacion, ubicacion, mapa, () =>
      L.divIcon({ className: 'punto-origen', html: '<span></span>', iconSize: [56, 56], iconAnchor: [28, 28] }),
      -1000,
    );
    this.marcadorDestino = moverMarcador(this.marcadorDestino, destino, mapa, () =>
      L.divIcon({
        className: '',
        html: '<div class="pin-destino"><span></span></div>',
        // La punta de la gota es la que marca el lugar.
        iconSize: [36, 48],
        iconAnchor: [18, 39],
      }),
      500,
    );

    const cambioDestino = !mismoPunto(destino, this.ultimoDestino);
    const cambioUbicacion = !mismoPunto(ubicacion, this.ultimaUbicacion);
    const cambiaronResultados = estacionamientos !== this.ultimosResultados;
    this.ultimosResultados = estacionamientos;
    this.ultimaUbicacion = ubicacion;
    this.ultimoDestino = destino;

    if (this.encuadrarResultados()) {
      if (cambiaronResultados && puntos.length > 0) {
        mapa.fitBounds(L.latLngBounds(puntos), { padding: [60, 60], maxZoom: 16 });
      }
      return;
    }

    // Fuera de eso, el mapa solo se mueve si el conductor elige un lugar o
    // aparece su ubicacion: los estacionamientos de esa zona se piden al moverse.
    if (destino && cambioDestino) {
      mapa.flyTo([destino.latitud, destino.longitud], ZOOM_DESTINO, { duration: 0.8 });
    } else if (!destino && ubicacion && cambioUbicacion) {
      mapa.flyTo([ubicacion.latitud, ubicacion.longitud], ZOOM_UBICACION, { duration: 0.8 });
    }
  }
}

/**
 * Crea, mueve o saca un marcador que no se puede tocar (ubicacion, destino).
 * Devuelve el marcador vigente (o `undefined` si ya no hay punto).
 */
function moverMarcador(
  marcador: L.Marker | undefined,
  punto: Coordenadas | null,
  mapa: L.Map,
  icono: () => L.DivIcon,
  zIndexOffset: number,
): L.Marker | undefined {
  if (!punto) {
    marcador?.remove();
    return undefined;
  }
  const posicion: L.LatLngTuple = [punto.latitud, punto.longitud];
  if (marcador) return marcador.setLatLng(posicion);
  return L.marker(posicion, { icon: icono(), interactive: false, keyboard: false, zIndexOffset }).addTo(
    mapa,
  );
}

/** "$1.200" (por hora; si no cobra por hora, la estadia). El color dice si esta disponible. */
function etiquetaPin(estacionamiento: Estacionamiento): string {
  const { hora, estadia, jornada } = estacionamiento.tarifas;
  const precio = hora ?? estadia ?? jornada;
  return precio == null ? 'P' : `$${precio.toLocaleString('es-AR')}`;
}

function iconoPin(estacionamiento: Estacionamiento, activo: boolean): L.DivIcon {
  const estado = estadoDisponibilidad(estacionamiento);
  const clases = ['pin', CLASE_ESTADO[estado], activo ? 'pin--activo' : ''].join(' ');
  return L.divIcon({
    className: '',
    html: `<div class="${clases}"><span class="pin__cabeza"><b>P</b></span><span class="pin__precio">${etiquetaPin(estacionamiento)}</span></div>`,
    // La punta del pin (abajo de la "P") es la que cae sobre la direccion.
    iconSize: [96, 64],
    iconAnchor: [48, 36],
  });
}

function areaDe(mapa: L.Map): AreaMapa {
  const limites = mapa.getBounds();
  return {
    latitudMinima: limites.getSouth(),
    latitudMaxima: limites.getNorth(),
    longitudMinima: limites.getWest(),
    longitudMaxima: limites.getEast(),
  };
}

function mismoPunto(a: Coordenadas | null | undefined, b: Coordenadas | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.latitud === b.latitud && a.longitud === b.longitud;
}
