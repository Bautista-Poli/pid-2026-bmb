import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Boton } from '@app/components/ui';
import { FormularioEstacionamiento } from '@app/components/estacionamiento';
import { Id, NuevoEstacionamiento } from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

/**
 * Pantalla `/propietario/estacionamientos/nuevo` · rol PROPIETARIO
 *
 * Alta de estacionamiento. El formulario es el mismo que usa la edicion; aca
 * solo se decide que hacer con los datos: crearlo, subir la foto si se elegio
 * una, y llevar a sus cocheras.
 */
@Component({
  selector: 'app-alta-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Boton, FormularioEstacionamiento],
  templateUrl: './alta-estacionamiento.html',
})
export class AltaEstacionamiento {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly router = inject(Router);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  // Se completa si el estacionamiento se creo pero la foto no se pudo subir:
  // ya existe, asi que no tiene sentido bloquear al propietario por la foto.
  protected readonly avisoFoto = signal<Id | null>(null);

  // Se guarda hasta que el estacionamiento exista: la foto se sube con su id,
  // que recien llega en la respuesta del POST.
  private foto: File | null = null;

  protected elegirFoto(archivo: File | null): void {
    this.foto = archivo;
  }

  /** `POST /api/estacionamientos`, y despues la foto si se elegio una. */
  protected crear(datos: NuevoEstacionamiento): void {
    this.enviando.set(true);
    this.error.set(null);
    this.avisoFoto.set(null);

    this.estacionamientos.crear(datos).subscribe({
      next: (estacionamiento) => this.subirFotoYNavegar(estacionamiento.id),
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  private subirFotoYNavegar(id: Id): void {
    if (!this.foto) {
      this.enviando.set(false);
      this.irACocheras(id);
      return;
    }

    this.estacionamientos.subirFoto(id, this.foto).subscribe({
      next: () => {
        this.enviando.set(false);
        this.irACocheras(id);
      },
      error: () => {
        // El estacionamiento ya quedo creado: se deja elegir si reintentar
        // (desde Editar) o seguir igual, en vez de perder la navegacion.
        this.enviando.set(false);
        this.avisoFoto.set(id);
      },
    });
  }

  protected continuarSinFoto(): void {
    const id = this.avisoFoto();
    if (id) this.irACocheras(id);
  }

  private irACocheras(id: Id): void {
    void this.router.navigate(['/propietario/estacionamientos', id, 'cocheras']);
  }
}
