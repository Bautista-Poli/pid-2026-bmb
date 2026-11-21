import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boton, EstadoVacio, Modal } from '@app/components/ui';
import { Id, ReservaDetallada } from '@app/models';
import { ReservaService } from '@app/services/reserva.service';
import { TarjetaVigente } from './tarjeta-vigente/tarjeta-vigente';
import { CancelarReserva } from './cancelar-reserva/cancelar-reserva';
import { QrReserva } from './qr-reserva/qr-reserva';

/**
 * Pestaña "Vigentes" de Mis reservas: la reserva en curso arriba, con su reloj,
 * y despues las proximas de la mas cercana a la mas lejana. Tambien es dueña
 * de lo que solo se hace con una reserva vigente: ver su QR y cancelarla.
 */
@Component({
  selector: 'app-reservas-vigentes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TarjetaVigente, CancelarReserva, QrReserva, EstadoVacio, Boton, Modal, RouterLink],
  templateUrl: './reservas-vigentes.html',
  styleUrl: './reservas-vigentes.css',
})
export class ReservasVigentes {
  private readonly servicio = inject(ReservaService);

  /** Reservas en juego, ya ordenadas de la mas cercana a la mas lejana. */
  readonly reservas = input.required<ReservaDetallada[]>();

  /** La reserva ya se cancelo en el back: la pantalla avisa y recarga la lista. */
  readonly cancelada = output<ReservaDetallada>();

  /** Reserva que el conductor quiere cancelar: mientras no sea null, el modal esta abierto. */
  protected readonly aCancelar = signal<ReservaDetallada | null>(null);
  /** Reserva que se esta cancelando: pinta el spinner en su tarjeta y en el modal. */
  protected readonly cancelandoId = signal<Id | null>(null);
  /** Error del ultimo intento, se muestra adentro del modal para poder reintentar. */
  protected readonly errorCancelar = signal<string | null>(null);
  /** Reserva cuyo QR se esta mostrando: mientras no sea null, el modal esta abierto. */
  protected readonly conQrAbierto = signal<ReservaDetallada | null>(null);

  protected readonly enCurso = computed(() =>
    this.reservas().filter((reserva) => reserva.estado === 'ACTIVA'),
  );
  protected readonly proximas = computed(() =>
    this.reservas().filter((reserva) => reserva.estado !== 'ACTIVA'),
  );

  protected pedirCancelacion(reserva: ReservaDetallada): void {
    this.errorCancelar.set(null);
    this.aCancelar.set(reserva);
  }

  protected cerrarCancelacion(): void {
    // Mientras viaja el PATCH el modal queda abierto: si falla, el error se ve ahi.
    if (this.cancelandoId()) return;
    this.aCancelar.set(null);
  }

  /** `PATCH /api/reservas/:id/cancelar` */
  protected confirmarCancelacion(): void {
    const reserva = this.aCancelar();
    if (!reserva) return;

    this.cancelandoId.set(reserva.id);
    this.errorCancelar.set(null);

    this.servicio.cancelar(reserva.id).subscribe({
      next: () => {
        this.cancelandoId.set(null);
        this.aCancelar.set(null);
        this.cancelada.emit(reserva);
      },
      error: (e: Error) => {
        this.cancelandoId.set(null);
        this.errorCancelar.set(e.message);
      },
    });
  }
}
