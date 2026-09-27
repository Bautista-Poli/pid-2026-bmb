import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { FormularioEstacionamiento } from '@app/components/estacionamiento';
import { Boton, Cargando, EstadoVacio } from '@app/components/ui';
import { Id, NuevoEstacionamiento } from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

/**
 * Pantalla `/propietario/estacionamientos/:estacionamientoId/editar` · rol PROPIETARIO
 *
 * Tres cosas sobre un estacionamiento ya cargado: cambiar sus datos, sacarlo o
 * volver a ponerlo en la busqueda, y darlo de baja.
 */
@Component({
  selector: 'app-editar-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormularioEstacionamiento, Boton, Cargando, EstadoVacio],
  templateUrl: './editar-estacionamiento.html',
})
export class EditarEstacionamiento {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly router = inject(Router);

  /** Llega del parametro de ruta `:estacionamientoId`. */
  readonly estacionamientoId = input.required<Id>();

  protected readonly recurso = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.estacionamientos.obtener(params),
  });

  protected readonly enviando = signal(false);
  protected readonly publicando = signal(false);
  protected readonly borrando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  // `undefined` = no se toco la foto en este envio, `null` = se pidio
  // quitarla, `File` = se elige una nueva.
  private foto: File | null | undefined;

  protected elegirFoto(archivo: File | null): void {
    this.foto = archivo;
  }

  /** `PATCH /api/estacionamientos/:id` con el formulario completo, y la foto si se toco. */
  protected guardar(datos: NuevoEstacionamiento): void {
    this.enviando.set(true);
    this.error.set(null);

    this.estacionamientos.actualizar(this.estacionamientoId(), datos).subscribe({
      next: () => this.guardarFoto(),
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  private guardarFoto(): void {
    if (this.foto === undefined) {
      this.volverAlListado();
      return;
    }

    const id = this.estacionamientoId();
    const pedido = this.foto
      ? this.estacionamientos.subirFoto(id, this.foto)
      : this.estacionamientos.borrarFoto(id);

    pedido.subscribe({
      next: () => this.volverAlListado(),
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(`Guardamos los datos, pero la foto no se pudo actualizar: ${e.message}`);
      },
    });
  }

  /** Publicar o despublicar sin tocar el resto de los datos. */
  protected alternarPublicacion(): void {
    const estacionamiento = this.recurso.value();
    if (!estacionamiento) return;

    const publicado = !estacionamiento.publicado;
    this.publicando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    this.estacionamientos.cambiarPublicacion(estacionamiento.id, publicado).subscribe({
      next: (actualizado) => {
        this.publicando.set(false);
        this.recurso.set(actualizado);
        this.aviso.set(
          publicado
            ? 'El estacionamiento vuelve a aparecer en la búsqueda.'
            : 'El estacionamiento ya no aparece en la búsqueda.',
        );
      },
      error: (e: Error) => {
        this.publicando.set(false);
        this.error.set(e.message);
      },
    });
  }

  /** `DELETE /api/estacionamientos/:id` (baja logica), con confirmacion. */
  protected darDeBaja(): void {
    const estacionamiento = this.recurso.value();
    if (!estacionamiento) return;

    const seguro = confirm(
      `¿Dar de baja ${estacionamiento.nombre}? Se cancelan las reservas que todavía no empezaron ` +
        'y sus cocheras quedan inactivas.',
    );
    if (!seguro) return;

    this.borrando.set(true);
    this.error.set(null);

    this.estacionamientos.darDeBaja(estacionamiento.id).subscribe({
      next: () => this.volverAlListado(),
      error: (e: Error) => {
        this.borrando.set(false);
        this.error.set(e.message);
      },
    });
  }

  private volverAlListado(): void {
    void this.router.navigate(['/propietario/estacionamientos']);
  }
}
