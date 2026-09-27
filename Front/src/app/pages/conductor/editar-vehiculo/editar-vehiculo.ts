import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { FormularioVehiculo, FotoVehiculo } from '@app/components/vehiculo';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { descripcionVehiculo, Id, NuevoVehiculo } from '@app/models';
import { VehiculoService } from '@app/services/vehiculo.service';

/**
 * Pantalla `/conductor/vehiculos/:vehiculoId/editar` · rol CONDUCTOR
 *
 * Edita los datos de un vehiculo o lo da de baja. Al guardar o eliminar vuelve
 * al listado.
 */
@Component({
  selector: 'app-editar-vehiculo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormularioVehiculo, FotoVehiculo, Boton, Cargando, EstadoVacio, Tarjeta],
  templateUrl: './editar-vehiculo.html',
})
export class EditarVehiculo {
  private readonly vehiculos = inject(VehiculoService);
  private readonly router = inject(Router);

  /** Llega del parametro de ruta `:vehiculoId`. */
  readonly vehiculoId = input.required<Id>();

  protected readonly recurso = rxResource({
    params: () => this.vehiculoId(),
    stream: ({ params }) => this.vehiculos.obtener(params),
  });

  protected readonly descripcion = descripcionVehiculo;

  protected readonly enviando = signal(false);
  protected readonly borrando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** `PATCH /api/vehiculos/:id` */
  protected guardar(cambios: NuevoVehiculo): void {
    const vehiculo = this.recurso.value();
    if (!vehiculo) return;

    this.enviando.set(true);
    this.error.set(null);

    this.vehiculos.actualizar(vehiculo, cambios).subscribe({
      next: () => this.volverAlListado(),
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  /** `DELETE /api/vehiculos/:id` (baja logica), con confirmacion. */
  protected eliminar(): void {
    const vehiculo = this.recurso.value();
    if (!vehiculo) return;

    const seguro = confirm(
      `¿Eliminar el vehículo ${vehiculo.patente}? Dejará de aparecer en tus vehículos.`,
    );
    if (!seguro) return;

    this.borrando.set(true);
    this.error.set(null);

    this.vehiculos.eliminar(vehiculo).subscribe({
      next: () => this.volverAlListado(),
      error: (e: Error) => {
        this.borrando.set(false);
        this.error.set(e.message);
      },
    });
  }

  private volverAlListado(): void {
    void this.router.navigate(['/conductor/vehiculos']);
  }
}
