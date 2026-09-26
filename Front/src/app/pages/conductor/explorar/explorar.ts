import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  FiltrosEstacionamiento as FiltrosComponent,
  TarjetaEstacionamiento,
} from '@app/components/estacionamiento';
import { Boton, Cargando, EstadoVacio } from '@app/components/ui';
import { Estacionamiento, FiltrosEstacionamiento } from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { UbicacionService } from '@app/services/ubicacion.service';
import { distanciaHasta } from '@app/utils/distancia.util';

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

  protected readonly filtros = signal<FiltrosEstacionamiento>({ ...FILTROS_INICIALES });

  /** Se vuelve a pedir al backend cada vez que cambia algun filtro. */
  protected readonly recurso = rxResource({
    params: () => this.filtros(),
    stream: ({ params }) => this.estacionamientos.listar(params),
    defaultValue: [] as Estacionamiento[],
  });

  /**
   * El listado con la distancia desde la ubicacion actual. Se calcula aca y no
   * en el backend, asi la ubicacion del conductor no sale del navegador. Cuando
   * llega la ubicacion se recalcula sin volver a pedir el listado.
   */
  protected readonly listado = computed(() => {
    const origen = this.ubicacion.posicion();
    return this.recurso.value().map((estacionamiento) => ({
      ...estacionamiento,
      distanciaKm: distanciaHasta(origen, estacionamiento.direccion),
    }));
  });

  /** Aviso cuando no se puede mostrar la distancia por falta de ubicacion. */
  protected readonly sinUbicacion = computed(() => {
    const estado = this.ubicacion.estado();
    return estado === 'denegada' || estado === 'no-disponible';
  });

  protected readonly resultados = computed(() => this.recurso.value().length);

  constructor() {
    this.ubicacion.solicitar();
  }

  protected limpiarFiltros(): void {
    this.filtros.set({ ...FILTROS_INICIALES });
  }

  protected irAReservar(estacionamiento: Estacionamiento): void {
    void this.router.navigate(['/conductor/reservar', estacionamiento.id]);
  }
}
