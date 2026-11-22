import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { Boton, Modal } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { ReservaService } from '@app/services/reserva.service';

/**
 * Modal "Marcar ausente": el propietario marca a mano como ausente (no-show)
 * una reserva confirmada cuyo conductor aviso que no viene, y la cochera queda
 * libre. No se puede deshacer.
 *
 * Se arregla solo: hace el pedido y, si falla, muestra el error adentro para
 * reintentar. A quien lo usa le avisa con `marcada` cuando ya quedo ausente.
 */
@Component({
  selector: 'app-marcar-ausente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Modal],
  templateUrl: './marcar-ausente.html',
  styleUrl: './marcar-ausente.css',
})
export class MarcarAusente {
  private readonly reservas = inject(ReservaService);

  /** null = cerrado. */
  readonly reserva = input<ReservaDetallada | null>(null);

  readonly cerrado = output<void>();
  readonly marcada = output<void>();

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Cada reserva arranca sin el error de la anterior. */
  private readonly alAbrir = effect(() => {
    this.reserva();
    this.error.set(null);
  });

  /** `PATCH /api/reservas/:id/ausente` */
  protected marcar(reserva: ReservaDetallada): void {
    if (this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);

    this.reservas.marcarAusente(reserva.id).subscribe({
      next: () => {
        this.enviando.set(false);
        this.marcada.emit();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  /** No se cierra en medio del pedido, para no dejar la accion a ciegas. */
  protected cerrar(): void {
    if (this.enviando()) return;
    this.cerrado.emit();
  }
}
