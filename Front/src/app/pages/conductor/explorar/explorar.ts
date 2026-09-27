import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, map, of } from 'rxjs';
import {
  FiltrosEstacionamiento as FiltrosComponent,
  TarjetaEstacionamiento,
} from '@app/components/estacionamiento';
import { Boton, Cargando, EstadoVacio, Sugerencia } from '@app/components/ui';
import { Estacionamiento, FiltrosEstacionamiento } from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { DireccionGeoref, GeorefService, ZonaBusqueda } from '@app/services/georef.service';
import { UbicacionService } from '@app/services/ubicacion.service';
import { distanciaHasta, porCercania } from '@app/utils/distancia.util';

/** El filtro por tipo de vehiculo es obligatorio y arranca en AUTO. */
const FILTROS_INICIALES: FiltrosEstacionamiento = {
  busqueda: '',
  tipoVehiculo: 'AUTO',
  orden: 'DISTANCIA',
};

/**
 * Pantalla `/conductor/explorar` · rol CONDUCTOR
 *
 * Listado y filtrado de estacionamientos. Es el inicio del conductor.
 * Las distancias se miden desde el destino elegido en el buscador o, si no
 * eligio ninguno, desde su ubicacion actual.
 */
@Component({
  selector: 'app-explorar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FiltrosComponent, TarjetaEstacionamiento, Cargando, EstadoVacio, Boton],
  templateUrl: './explorar.html',
})
export class Explorar {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly router = inject(Router);
  private readonly ubicacion = inject(UbicacionService);
  private readonly georef = inject(GeorefService);

  protected readonly filtros = signal<FiltrosEstacionamiento>({ ...FILTROS_INICIALES });

  /** Se vuelve a pedir al backend cada vez que cambia algun filtro. */
  protected readonly recurso = rxResource({
    params: () => this.filtros(),
    stream: ({ params }) => this.estacionamientos.listar(params),
    defaultValue: [] as Estacionamiento[],
  });

  /* -------------------------------- Destino -------------------------------- */

  /** Direccion elegida en el buscador: las distancias se miden desde ahi. */
  protected readonly destino = signal<DireccionGeoref | null>(null);

  /**
   * Todos los estacionamientos publicados, sin filtros: de ahi salen las ciudades
   * donde buscar el destino. No sirve el listado filtrado porque mientras se
   * escribe "Pueyrredon 2409" el filtro de texto lo deja vacio.
   */
  private readonly todos = rxResource({
    stream: () => this.estacionamientos.listar({}),
    defaultValue: [] as Estacionamiento[],
  });

  /**
   * Las ciudades donde hay estacionamientos: el destino se busca solo ahi. No
   * sirve de nada un "Pueyrredon 2409" en una ciudad sin cocheras, y sin acotar
   * Georef devuelve esa altura en decenas de ciudades del pais.
   */
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

  protected readonly buscarDestinos = (texto: string): Observable<Sugerencia[]> => {
    // Sin altura no hay un punto al cual medir: Georef devolveria la calle entera.
    if (!/\d/.test(texto)) return of([]);
    return this.georef
      .buscarDestinos(texto, this.zonas())
      .pipe(
        map((destinos) =>
          destinos.map((d) => ({ nombre: d.nombre, detalle: d.detalle, dato: d })),
        ),
      );
  };

  /* ------------------------------- Listado --------------------------------- */

  /** Desde donde se miden las distancias: el destino elegido o la ubicacion actual. */
  private readonly origen = computed(
    () => this.destino()?.coordenadas ?? this.ubicacion.posicion(),
  );

  /**
   * El listado con la distancia desde el origen y, si el orden es por distancia
   * (el de siempre), del mas cercano al mas lejano. Se calcula aca y no en el
   * backend, asi la ubicacion del conductor no sale del navegador. Cuando cambia
   * el origen se reordena sin volver a pedir el listado.
   */
  protected readonly listado = computed(() => {
    const origen = this.origen();
    const conDistancia = this.recurso.value().map((estacionamiento) => ({
      ...estacionamiento,
      distanciaKm: distanciaHasta(origen, estacionamiento.direccion),
    }));
    // Con orden PRECIO se respeta el que ya trae el servicio.
    return this.filtros().orden === 'PRECIO' ? conDistancia : conDistancia.sort(porCercania);
  });

  /** Aviso cuando no se puede mostrar la distancia: no hay destino ni ubicacion. */
  protected readonly sinUbicacion = computed(() => {
    const estado = this.ubicacion.estado();
    return !this.destino() && (estado === 'denegada' || estado === 'no-disponible');
  });

  protected readonly resultados = computed(() => this.recurso.value().length);

  constructor() {
    this.ubicacion.solicitar();
  }

  protected limpiarFiltros(): void {
    this.filtros.set({ ...FILTROS_INICIALES });
    this.destino.set(null);
  }

  protected irAReservar(estacionamiento: Estacionamiento): void {
    void this.router.navigate(['/conductor/reservar', estacionamiento.id]);
  }
}
