import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  Boton,
  Cargando,
  EstadoVacio,
  Etiqueta,
  Icono,
  Miniatura,
  Modal,
  Tarjeta,
} from '@app/components/ui';
import { ListaCalificaciones, Reputacion } from '@app/components/calificacion';
import { direccionCorta, Estacionamiento, Id } from '@app/models';
import { resumenTarifas } from '@app/utils/tarifa.util';
import { AuthService } from '@app/services/auth.service';
import { CalificacionService } from '@app/services/calificacion.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

/**
 * Pantalla `/propietario/estacionamientos` · rol PROPIETARIO
 *
 * Los estacionamientos propios: sus datos, su publicacion y su edicion. Las
 * cocheras se administran desde el menu Cocheras.
 */
@Component({
  selector: 'app-estacionamientos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    Boton,
    Cargando,
    EstadoVacio,
    Etiqueta,
    Icono,
    Miniatura,
    Modal,
    Tarjeta,
    Reputacion,
    ListaCalificaciones,
  ],
  templateUrl: './estacionamientos.html',
})
export class Estacionamientos {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly auth = inject(AuthService);

  protected readonly direccionCorta = direccionCorta;

  protected readonly recurso = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario(),
    defaultValue: [] as Estacionamiento[],
  });

  /* ------------------ calificaciones (solo las ve el dueno) ------------------ */
  private readonly calificacionService = inject(CalificacionService);
  protected readonly conCalificaciones = signal<Estacionamiento | null>(null);
  protected readonly calificaciones = rxResource({
    params: () => this.conCalificaciones()?.id,
    stream: ({ params: id }) => this.calificacionService.recibidasPorEstacionamiento(id),
  });

  protected verCalificaciones(estacionamiento: Estacionamiento): void {
    this.conCalificaciones.set(estacionamiento);
  }

  protected readonly reenviandoId = signal<Id | null>(null);
  protected readonly errorReenvio = signal<{ id: Id; mensaje: string } | null>(null);

  /** Un rechazado vuelve a la cola del administrador en el momento, sin esperar. */
  protected reenviar(estacionamiento: Estacionamiento): void {
    this.reenviandoId.set(estacionamiento.id);
    this.errorReenvio.set(null);
    this.estacionamientos.reenviarRevision(estacionamiento.id).subscribe({
      next: () => {
        this.reenviandoId.set(null);
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.reenviandoId.set(null);
        this.errorReenvio.set({ id: estacionamiento.id, mensaje: e.message });
      },
    });
  }

  /** "$1.200 / hora", o el resumen de tarifas si no cobra por hora. */
  protected precio(estacionamiento: Estacionamiento): string {
    const { hora } = estacionamiento.tarifas;
    if (hora !== null) return `$${hora.toLocaleString('es-AR')} / hora`;
    return resumenTarifas(estacionamiento.tarifas) || 'Sin tarifas';
  }
}
