import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ReservaDetallada } from '@app/models';
import { puedeAvanzar } from '@app/services/ciclo-reserva';
import { ReservaService } from '@app/services/reserva.service';

/** Como termino una accion sobre una reserva: el aviso para mostrar, o el error. */
export type ResultadoReserva = { aviso: string } | { error: string };

/**
 * Boton "Confirmar" de una reserva pendiente, para el propietario. Lo usan la
 * lista de Reservas y las reservas de hoy del tablero.
 *
 * Se arregla solo: aparece unicamente si la reserva se puede confirmar, hace
 * el pedido y muestra su spinner. A quien lo usa le avisa como termino, para
 * que muestre el mensaje y recargue:
 *
 *   <app-confirmar-reserva [reserva]="reserva" (resultado)="alTerminar($event)" />
 *
 * El ingreso y el egreso no pasan por aca: van solo con el codigo del conductor.
 */
@Component({
  selector: 'app-confirmar-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirmar-reserva.html',
  styleUrl: './confirmar-reserva.css',
  host: { style: 'display: contents' },
})
export class ConfirmarReserva {
  private readonly reservas = inject(ReservaService);

  readonly reserva = input.required<ReservaDetallada>();
  /** `suave`: fondo tenue (tablas). `lleno`: fondo de acento (mobile). `texto`: solo el texto (listas chicas). */
  readonly variante = input<'suave' | 'lleno' | 'texto'>('suave');

  readonly resultado = output<ResultadoReserva>();

  protected readonly confirmando = signal(false);
  protected readonly visible = computed(() => puedeAvanzar(this.reserva()));

  /** `PATCH /api/reservas/:id/confirmar` */
  protected confirmar(): void {
    const reserva = this.reserva();
    this.confirmando.set(true);

    this.reservas.confirmar(reserva.id).subscribe({
      next: () => {
        this.confirmando.set(false);
        this.resultado.emit({ aviso: `Confirmaste la reserva de ${reserva.vehiculo.patente}.` });
      },
      error: (e: Error) => {
        this.confirmando.set(false);
        this.resultado.emit({ error: e.message });
      },
    });
  }
}
