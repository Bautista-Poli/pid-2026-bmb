import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { EntornoService } from '@app/services/entorno.service';
import { TemaService } from '@app/services/tema.service';
import { Coordenadas } from '@app/utils/distancia.util';
import { crearFondoMapa, usaFiltroOsm } from '@app/utils/fondo-mapa.util';

/** Obelisco: donde arranca si todavia no hay ubicacion. */
const CENTRO_INICIAL: L.LatLngTuple = [-34.6037, -58.3816];
const ZOOM_SIN_UBICACION = 12;
const ZOOM_CON_UBICACION = 16;

/**
 * Mapa chico para marcar donde queda el estacionamiento: tocar el mapa pone (o
 * mueve) el punto. Lo usa el formulario en modo offline, donde no se puede
 * geocodificar la direccion y las coordenadas las marca el propietario.
 */
@Component({
  selector: 'app-selector-ubicacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #contenedor class="absolute inset-0"></div>`,
  host: {
    class: 'relative block h-64 overflow-hidden rounded-control border border-borde',
    '[class.mapa-osm]': 'usaOsm',
    '[class.mapa-osm--oscuro]': 'usaOsm && tema.esOscuro()',
  },
})
export class SelectorUbicacion {
  protected readonly tema = inject(TemaService);
  private readonly offline = inject(EntornoService).offline();
  protected readonly usaOsm = usaFiltroOsm(this.offline);

  /** La ubicacion marcada; `null` mientras no se toco el mapa. */
  readonly coordenadas = model<Coordenadas | null>(null);

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private readonly listo = signal(false);
  private mapa?: L.Map;
  private fondo?: L.Layer;
  private punto?: L.CircleMarker;
  private observador?: ResizeObserver;

  constructor() {
    afterNextRender(() => {
      this.crearMapa();
      this.listo.set(true);
    });

    inject(DestroyRef).onDestroy(() => {
      this.observador?.disconnect();
      this.mapa?.remove();
    });

    effect(() => {
      if (!this.listo()) return;
      const oscuro = this.tema.esOscuro();
      untracked(() => void this.ponerFondo(oscuro));
    });

    // Las coordenadas pueden llegar de afuera (al precargar el editor).
    effect(() => {
      if (!this.listo()) return;
      const coordenadas = this.coordenadas();
      untracked(() => this.marcar(coordenadas));
    });
  }

  private crearMapa(): void {
    const inicial = this.coordenadas();
    this.mapa = L.map(this.contenedor().nativeElement, { attributionControl: true }).setView(
      inicial ? [inicial.latitud, inicial.longitud] : CENTRO_INICIAL,
      inicial ? ZOOM_CON_UBICACION : ZOOM_SIN_UBICACION,
    );
    this.mapa.on('click', ({ latlng }: L.LeafletMouseEvent) => {
      // Seis decimales: ~10 cm, mas que suficiente (y entra en DECIMAL(9, 6)).
      const redondear = (valor: number) => Math.round(valor * 1e6) / 1e6;
      this.coordenadas.set({ latitud: redondear(latlng.lat), longitud: redondear(latlng.lng) });
    });
    this.observador = new ResizeObserver(() => this.mapa?.invalidateSize());
    this.observador.observe(this.contenedor().nativeElement);
  }

  private async ponerFondo(oscuro: boolean): Promise<void> {
    const fondo = await crearFondoMapa(oscuro, this.offline);
    if (!this.mapa) return;
    this.fondo?.remove();
    this.fondo = fondo.addTo(this.mapa);
  }

  private marcar(coordenadas: Coordenadas | null): void {
    if (!this.mapa) return;
    if (!coordenadas) {
      this.punto?.remove();
      this.punto = undefined;
      return;
    }
    const posicion: L.LatLngTuple = [coordenadas.latitud, coordenadas.longitud];
    if (this.punto) {
      this.punto.setLatLng(posicion);
    } else {
      this.punto = L.circleMarker(posicion, {
        radius: 9,
        weight: 3,
        color: '#ffffff',
        fillColor: '#2563eb',
        fillOpacity: 1,
      }).addTo(this.mapa);
    }
  }
}
