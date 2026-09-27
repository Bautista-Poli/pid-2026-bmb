import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Etiqueta, Tarjeta } from '@app/components/ui';
import { FotoVehiculo } from '@app/components/vehiculo';
import { descripcionVehiculo, Vehiculo } from '@app/models';
import { VehiculoService } from '@app/services/vehiculo.service';

/**
 * Pantalla `/conductor/vehiculos` · rol CONDUCTOR
 *
 * Listado de vehiculos. El alta y la edicion viven en sus propias pantallas
 * (`vehiculos/nuevo` y `vehiculos/:id/editar`); desde aca se entra a ellas.
 */
@Component({
  selector: 'app-vehiculos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Boton, Cargando, EstadoVacio, Etiqueta, FotoVehiculo, Tarjeta],
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

}
