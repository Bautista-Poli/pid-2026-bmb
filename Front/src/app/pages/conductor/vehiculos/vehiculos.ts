import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Modal } from '@app/components/ui';
import { ChapaPatente, TarjetaVehiculo } from '@app/components/vehiculo';
import { descripcionVehiculo, Id, Vehiculo } from '@app/models';
import { VehiculoService } from '@app/services/vehiculo.service';

/**
 * Pantalla `/conductor/vehiculos` · rol CONDUCTOR
 *
 * Los vehiculos en tarjetas, con las acciones rapidas (hacer predeterminado y
 * eliminar) a mano. El alta y la edicion viven en sus propias pantallas
 * (`vehiculos/nuevo` y `vehiculos/:id/editar`); desde aca se entra a ellas.
 */
@Component({
  selector: 'app-vehiculos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Boton, Cargando, ChapaPatente, EstadoVacio, Modal, TarjetaVehiculo],
  templateUrl: './vehiculos.html',
})
export class Vehiculos {
  private readonly vehiculos = inject(VehiculoService);

  /** Query param `volver`: la reserva desde la que llego el conductor. */
  readonly volver = input<string>();

  protected readonly descripcion = descripcionVehiculo;

  protected readonly recurso = rxResource({
    stream: () => this.vehiculos.listarMisVehiculos(),
    defaultValue: [] as Vehiculo[],
  });

  /** Vehiculo que se esta marcando como predeterminado: spinner en su tarjeta. */
  protected readonly predeterminandoId = signal<Id | null>(null);
  /** Vehiculo que el conductor quiere eliminar: mientras no sea null, el modal esta abierto. */
  protected readonly aEliminar = signal<Vehiculo | null>(null);
  protected readonly eliminando = signal(false);
  /** Error del ultimo intento de eliminar, adentro del modal para poder reintentar. */
  protected readonly errorEliminar = signal<string | null>(null);
  /** Resultado de la ultima accion, arriba de la lista. */
  protected readonly aviso = signal<{ tono: 'exito' | 'error'; texto: string } | null>(null);

  /** Mientras viaja un pedido las tarjetas no aceptan otra accion. */
  protected readonly ocupado = computed(() => this.predeterminandoId() !== null || this.eliminando());

  /** Solo se vuelve a pantallas del conductor, para no abrir una redireccion arbitraria. */
  protected readonly rutaVolver = computed(() => {
    const ruta = this.volver();
    return ruta?.startsWith('/conductor/') ? ruta : null;
  });

  /** Se le pasa al alta para no perder la reserva de origen. */
  protected readonly paramsAlta = computed(() => {
    const volver = this.rutaVolver();
    return volver ? { volver } : {};
  });

  /** `PATCH /api/vehiculos/:id` con `predeterminado: true`; el backend desmarca al anterior. */
  protected predeterminar(vehiculo: Vehiculo): void {
    this.predeterminandoId.set(vehiculo.id);
    this.aviso.set(null);

    this.vehiculos.actualizar(vehiculo, { predeterminado: true }).subscribe({
      next: () => {
        this.predeterminandoId.set(null);
        this.aviso.set({ tono: 'exito', texto: `${vehiculo.patente} es tu vehículo predeterminado.` });
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.predeterminandoId.set(null);
        this.aviso.set({ tono: 'error', texto: e.message });
      },
    });
  }

  protected pedirEliminacion(vehiculo: Vehiculo): void {
    this.errorEliminar.set(null);
    this.aEliminar.set(vehiculo);
  }

  protected cerrarEliminacion(): void {
    // Mientras viaja el DELETE el modal queda abierto: si falla, el error se ve ahi.
    if (this.eliminando()) return;
    this.aEliminar.set(null);
  }

  /** `DELETE /api/vehiculos/:id` (baja logica: deja de aparecer en el listado). */
  protected confirmarEliminacion(): void {
    const vehiculo = this.aEliminar();
    if (!vehiculo) return;

    this.eliminando.set(true);
    this.errorEliminar.set(null);
    this.aviso.set(null);

    this.vehiculos.eliminar(vehiculo).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.aEliminar.set(null);
        this.aviso.set({ tono: 'exito', texto: `Eliminaste el vehículo ${vehiculo.patente}.` });
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.eliminando.set(false);
        this.errorEliminar.set(e.message);
      },
    });
  }
}
