import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
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
  styleUrl: './editar-vehiculo.css',
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
  /** Porcentaje de la subida de la foto en curso, o `null`. */
  protected readonly progresoFoto = signal<number | null>(null);

  // `undefined` = no se toco la foto, `null` = se pidio sacarla, `File` = una nueva.
  private foto: File | null | undefined;

  protected elegirFoto(archivo: File | null): void {
    this.foto = archivo;
  }

  private guardarFoto(id: Id): void {
    if (this.foto === undefined) {
      this.volverAlListado();
      return;
    }
    const pedido: Observable<unknown> = this.foto
      ? this.vehiculos.subirFoto(id, this.foto, (porcentaje) => this.progresoFoto.set(porcentaje))
      : this.vehiculos.borrarFoto(id);
    pedido.subscribe({
      next: () => this.volverAlListado(),
      error: (e: Error) => {
        this.progresoFoto.set(null);
        this.enviando.set(false);
        this.error.set(`Guardamos los datos, pero la foto no se pudo actualizar: ${e.message}`);
      },
    });
  }

  /** `PATCH /api/vehiculos/:id` */
  protected guardar(cambios: NuevoVehiculo): void {
    const vehiculo = this.recurso.value();
    if (!vehiculo) return;

    this.enviando.set(true);
    this.error.set(null);

    this.vehiculos.actualizar(vehiculo, cambios).subscribe({
      next: () => this.guardarFoto(vehiculo.id),
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
