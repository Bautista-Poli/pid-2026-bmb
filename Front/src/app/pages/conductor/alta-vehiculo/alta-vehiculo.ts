import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { FormularioVehiculo } from '@app/components/vehiculo';
import { Tarjeta } from '@app/components/ui';
import { NuevoVehiculo, Vehiculo } from '@app/models';
import { VehiculoService } from '@app/services/conductor/vehiculo.service';

/**
 * Pantalla `/conductor/vehiculos/nuevo` · rol CONDUCTOR
 *
 * Alta de un vehiculo en su propia pantalla. Al guardar vuelve al listado,
 * conservando el `volver` si el conductor venia de una reserva.
 */
@Component({
  selector: 'app-alta-vehiculo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormularioVehiculo, Tarjeta],
  templateUrl: './alta-vehiculo.html',
  styleUrl: './alta-vehiculo.css',
})
export class AltaVehiculo {
  private readonly vehiculos = inject(VehiculoService);
  private readonly router = inject(Router);

  /** Query param `volver`: la reserva desde la que llego el conductor. */
  readonly volver = input<string>();

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  // El listado solo alimenta el aviso "tu primer vehiculo queda predeterminado".
  private readonly recurso = rxResource({
    stream: () => this.vehiculos.listarMisVehiculos(),
    defaultValue: [] as Vehiculo[],
  });

  protected readonly esPrimero = computed(
    () => !this.recurso.isLoading() && this.recurso.value().length === 0,
  );

  protected readonly rutaVolver = computed(() => {
    const ruta = this.volver();
    return ruta?.startsWith('/conductor/') ? ruta : null;
  });

  /** `POST /api/vehiculos` y vuelta al listado. */
  protected guardar(datos: NuevoVehiculo): void {
    this.enviando.set(true);
    this.error.set(null);

    this.vehiculos.crear(datos).subscribe({
      next: () => this.volverAlListado(),
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  /** Navega a Mis vehiculos. */
  private volverAlListado(): void {
    const volver = this.rutaVolver();
    void this.router.navigate(['/conductor/vehiculos'], {
      queryParams: volver ? { volver } : {},
    });
  }
}
