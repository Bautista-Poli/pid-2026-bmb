import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Boton, Modal } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { puedeCancelar } from '@app/services/ciclo-reserva';
import { ReservaService } from '@app/services/reserva.service';
import { desdeFechaISO } from '@app/utils/fecha.util';

/**
 * Boton "Cancelar" de una reserva proxima, con su modal de confirmacion
 * (estacionamiento, dia, horario y vehiculo).
 *
 * Se arregla solo: aparece unicamente si la reserva todavia se puede cancelar,
 * abre y cierra su modal, hace el pedido y, si falla, muestra el error adentro
 * para reintentar. A quien lo usa solo le avisa cuando ya quedo cancelada:
 *
 *   <app-cancelar-reserva [reserva]="reserva" (cancelada)="alCancelar($event)" />
 */
@Component({
  selector: 'app-cancelar-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Boton, Modal],
  templateUrl: './cancelar-reserva.html',
  styleUrl: './cancelar-reserva.css',
})
export class CancelarReserva {
  private readonly reservas = inject(ReservaService);

  readonly reserva = input.required<ReservaDetallada>();

  /** La reserva ya se cancelo en el back. */
  readonly cancelada = output<ReservaDetallada>();

  protected readonly visible = computed(() => puedeCancelar(this.reserva()));
  protected readonly abierto = signal(false);
  protected readonly cancelando = signal(false);
  /** Error del ultimo intento, adentro del modal para poder reintentar. */
  protected readonly error = signal<string | null>(null);

  protected readonly desdeFechaISO = desdeFechaISO;

  protected abrir(): void {
    this.error.set(null);
    this.abierto.set(true);
  }

  protected cerrar(): void {
    // Mientras viaja el PATCH el modal queda abierto: si falla, el error se ve ahi.
    if (this.cancelando()) return;
    this.abierto.set(false);
  }

  /** `PATCH /api/reservas/:id/cancelar` */
  protected confirmar(): void {
    const reserva = this.reserva();
    this.cancelando.set(true);
    this.error.set(null);

    this.reservas.cancelar(reserva.id).subscribe({
      next: () => {
        this.cancelando.set(false);
        this.abierto.set(false);
        this.cancelada.emit(reserva);
      },
      error: (e: Error) => {
        this.cancelando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
