import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Boton, Modal } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { desdeFechaISO } from '@app/utils/fecha.util';

/**
 * Modal de las reservas vigentes para confirmar que se cancela una reserva: muestra
 * estacionamiento, dia, horario y vehiculo. La cancelacion la hace la pantalla
 * (reservas-vigentes.ts) al recibir `confirmar`.
 */
@Component({
  selector: 'app-cambiar-auto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ Boton, Modal],
  templateUrl: './cambiar-auto.html',
  styleUrl: './cambiar-auto.css',
})
export class CambiarAuto {
  /** Mientras no sea null, el modal esta abierto. */
  readonly reserva = input<ReservaDetallada | null>(null);
  /** Mientras viaja el pedido: spinner en el boton y "Volver" deshabilitado. */
  readonly cambiando = input(false);
  /** Error del ultimo intento, para poder reintentar. */
  readonly error = input<string | null>(null);

  readonly cerrado = output<void>();
  readonly confirmar = output<void>();

  protected readonly desdeFechaISO = desdeFechaISO;
}
