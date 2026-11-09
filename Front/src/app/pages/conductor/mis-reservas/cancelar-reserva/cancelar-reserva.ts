import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Boton, Modal } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { desdeFechaISO } from '@app/utils/fecha.util';

/**
 * Modal de Mis reservas para confirmar que se cancela una reserva: muestra
 * estacionamiento, dia, horario y vehiculo. La cancelacion la hace la pantalla
 * (mis-reservas.ts) al recibir `confirmar`.
 */
@Component({
  selector: 'app-cancelar-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Boton, Modal],
  templateUrl: './cancelar-reserva.html',
  styleUrl: './cancelar-reserva.css',
})
export class CancelarReserva {
  /** Mientras no sea null, el modal esta abierto. */
  readonly reserva = input<ReservaDetallada | null>(null);
  /** Mientras viaja el pedido: spinner en el boton y "Volver" deshabilitado. */
  readonly cancelando = input(false);
  /** Error del ultimo intento, para poder reintentar. */
  readonly error = input<string | null>(null);

  readonly cerrado = output<void>();
  readonly confirmar = output<void>();

  protected readonly desdeFechaISO = desdeFechaISO;
}
