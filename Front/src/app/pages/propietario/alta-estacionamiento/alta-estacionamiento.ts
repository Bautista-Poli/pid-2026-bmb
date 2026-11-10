import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormularioEstacionamiento } from '@app/components/estacionamiento';
import { Id, NuevoEstacionamiento } from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

/**
 * Pantalla `/propietario/estacionamientos/nuevo` · rol PROPIETARIO
 *
 * Alta de estacionamiento. El formulario es el mismo que usa la edicion; aca
 * solo se decide que hacer con los datos: crearlo y llevar a sus cocheras.
 */
@Component({
  selector: 'app-alta-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormularioEstacionamiento],
  templateUrl: './alta-estacionamiento.html',
  styleUrl: './alta-estacionamiento.css',
})
export class AltaEstacionamiento {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly router = inject(Router);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** `POST /api/estacionamientos` y a cargar sus cocheras. */
  protected crear(datos: NuevoEstacionamiento): void {
    this.enviando.set(true);
    this.error.set(null);

    this.estacionamientos.crear(datos).subscribe({
      next: (estacionamiento) => {
        this.enviando.set(false);
        this.irACocheras(estacionamiento.id);
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  private irACocheras(id: Id): void {
    void this.router.navigate(['/propietario/cocheras', id]);
  }
}
