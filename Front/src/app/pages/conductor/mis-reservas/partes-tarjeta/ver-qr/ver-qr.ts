import { ChangeDetectionStrategy, Component, computed, input, resource, signal } from '@angular/core';
import QRCode from 'qrcode';
import { Modal } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { tieneQr } from '@app/services/ciclo-reserva';
import { formatearCodigo, urlDeAcceso } from '@app/utils/codigo-acceso.util';

/**
 * Boton "Ver QR" de una reserva, con su modal: el QR y el codigo debajo. El
 * conductor lo muestra al entrar y al salir; si la camara no lo lee, el
 * operador tipea el codigo.
 *
 * Se arregla solo: aparece unicamente si la reserva ya tiene QR para mostrar
 * (confirmada o en curso), y abrir y cerrar el modal es cosa suya. La tarjeta
 * solo lo pone:
 *
 *   <app-ver-qr [reserva]="reserva" />
 */
@Component({
  selector: 'app-ver-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  templateUrl: './ver-qr.html',
  styleUrl: './ver-qr.css',
})
export class VerQr {
  readonly reserva = input.required<ReservaDetallada>();

  protected readonly visible = computed(() => tieneQr(this.reserva()));
  protected readonly abierto = signal(false);

  private readonly codigo = computed(() => this.reserva().codigoAcceso ?? '');
  protected readonly codigoVisible = computed(() => formatearCodigo(this.codigo()));

  /** El QR se dibuja recien al abrir el modal: no hace falta uno por tarjeta de la lista. */
  protected readonly imagen = resource({
    params: () => (this.abierto() ? this.codigo() : undefined),
    loader: ({ params }) => QRCode.toDataURL(urlDeAcceso(params), { width: 512, margin: 1 }),
  });
}
