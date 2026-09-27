import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Observable, debounceTime, map, of } from 'rxjs';
import {
  ElegirMomento,
  Exploracion,
  FiltrosEstacionamiento as FiltrosComponent,
  TarjetaEstacionamiento,
} from '@app/components/estacionamiento';
import { Boton, Cargando, EstadoVacio, Sugerencia } from '@app/components/ui';
import { Estacionamiento, FiltrosEstacionamiento, Vehiculo } from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { GeorefService, ZonaBusqueda } from '@app/services/georef.service';
import { VehiculoService } from '@app/services/vehiculo.service';
import { desdeFechaISO } from '@app/utils/fecha.util';

/** Espera antes de pedir al backend mientras se escribe en zona, precio o busqueda. */
const ESPERA_TIPEO_MS = 300;

/** El filtro por tipo de vehiculo es obligatorio; el valor real se pisa al elegir momento y ubicacion. */
const FILTROS_INICIALES: FiltrosEstacionamiento = {
  busqueda: '',
  tipoVehiculo: 'AUTO',
  orden: 'DISTANCIA',
};

/**
 * Pantalla `/conductor/explorar` · rol CONDUCTOR
 *
 * Inicio del conductor. Primero pregunta donde y cuando quiere estacionar y
 * recien despues lista y filtra los estacionamientos con lugar libre.
 *
 * Las distancias se miden desde la ubicacion actual o desde la direccion que
 * elija en esa pregunta ("Pueyrredon 2409"), que se busca en Georef.
 */
@Component({
  selector: 'app-explorar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ElegirMomento, FiltrosComponent, TarjetaEstacionamiento, Cargando, EstadoVacio, Boton],
  templateUrl: './explorar.html',
})
export class Explorar {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly vehiculos = inject(VehiculoService);
  private readonly router = inject(Router);
  private readonly georef = inject(GeorefService);

  protected readonly filtros = signal<FiltrosEstacionamiento>({ ...FILTROS_INICIALES });

  /** Mientras es null se muestra la pregunta "¿Donde y cuando queres estacionar?". */
  protected readonly exploracion = signal<Exploracion | null>(null);

  /** Vehiculos del conductor, para preseleccionar el tipo al terminar esa pregunta. */
  private readonly recursoVehiculos = rxResource({
    stream: () => this.vehiculos.listarMisVehiculos(),
    defaultValue: [] as Vehiculo[],
  });

  protected readonly resumen = computed(() => {
    const exploracion = this.exploracion();
    if (!exploracion) return '';
    return `${this.resumenUbicacion(exploracion)} · ${this.resumenMomento(exploracion)}`;
  });

  private readonly filtrosConContexto = computed(() => {
    const exploracion = this.exploracion();
    const ubicacion = exploracion?.ubicacion;
    return {
      ...this.filtros(),
      momento: exploracion?.momento ?? null,
      // La ubicacion actual y una direccion elegida son un punto: se mide la distancia desde ahi.
      origen:
        ubicacion?.tipo === 'ACTUAL' || ubicacion?.tipo === 'DIRECCION'
          ? { latitud: ubicacion.latitud, longitud: ubicacion.longitud }
          : null,
    };
  });
  private readonly filtrosEstables = toSignal(
    toObservable(this.filtrosConContexto).pipe(debounceTime(ESPERA_TIPEO_MS)),
    { initialValue: this.filtrosConContexto() },
  );

  /** Se vuelve a pedir al backend cuando cambia un filtro o el contexto (sin pedir hasta responder la primera pregunta). */
  protected readonly recurso = rxResource({
    params: () => (this.filtrosEstables().momento ? this.filtrosEstables() : undefined),
    stream: ({ params }) => this.estacionamientos.listar(params),
    defaultValue: [] as Estacionamiento[],
  });

  /* ------------------------ Direcciones de "otra zona" ----------------------- */

  /**
   * Todos los estacionamientos publicados, sin filtros: de ahi salen las ciudades
   * donde buscar las direcciones que sugiere la pregunta inicial.
   */
  private readonly todos = rxResource({
    stream: () => this.estacionamientos.listar({}),
    defaultValue: [] as Estacionamiento[],
  });

  /**
   * Las ciudades donde hay estacionamientos: las direcciones se buscan solo ahi. No
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

  protected readonly resultados = computed(() => this.recurso.value().length);

  protected limpiarFiltros(): void {
    this.filtros.set({ ...FILTROS_INICIALES, tipoVehiculo: this.filtros().tipoVehiculo });
  }

  /** Ubicacion, momento y tipo de vehiculo (el del predeterminado del conductor) quedan elegidos juntos. */
  protected iniciar(exploracion: Exploracion): void {
    const vehiculos = this.recursoVehiculos.value();
    const predeterminado = vehiculos.find((v) => v.predeterminado) ?? vehiculos[0];
    const zona = exploracion.ubicacion.tipo === 'OTRA' ? exploracion.ubicacion.zona : undefined;

    this.filtros.set({ ...FILTROS_INICIALES, tipoVehiculo: predeterminado?.tipo ?? 'AUTO', zona });
    this.exploracion.set(exploracion);
  }

  protected cambiarExploracion(): void {
    this.exploracion.set(null);
  }

  protected irAReservar(estacionamiento: Estacionamiento): void {
    void this.router.navigate(['/conductor/reservar', estacionamiento.id]);
  }

  private resumenUbicacion(exploracion: Exploracion): string {
    const ubicacion = exploracion.ubicacion;
    if (ubicacion.tipo === 'ACTUAL') return 'Cerca de mi ubicación';
    if (ubicacion.tipo === 'DIRECCION') return `Cerca de ${ubicacion.direccion}`;
    return ubicacion.zona;
  }

  private resumenMomento(exploracion: Exploracion): string {
    const momento = exploracion.momento;
    if (momento.tipo === 'AHORA') return 'Ahora';
    const dia = desdeFechaISO(momento.fecha).toLocaleDateString('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return `${dia} · ${momento.horaDesde} a ${momento.horaHasta}`;
  }
}
