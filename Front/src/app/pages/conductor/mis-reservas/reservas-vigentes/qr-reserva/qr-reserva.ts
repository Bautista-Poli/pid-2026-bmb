import { ChangeDetectionStrategy, Component, computed, input, resource } from '@angular/core';
import QRCode from 'qrcode';
import { formatearCodigo, urlDeAcceso } from '@app/utils/codigo-acceso.util';

/**
 * QR de una reserva con su codigo debajo. El conductor lo muestra al entrar y
 * al salir; si la camara no lo lee, el operador tipea el codigo.
 */
@Component({
  selector: 'app-qr-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center gap-3 text-center">
      @if (imagen.value(); as src) {
        <img [src]="src" alt="QR de la reserva" class="size-56 rounded-boton bg-white p-2" />
      } @else {
        <div class="size-56 animate-pulse rounded-boton bg-borde-sutil" aria-hidden="true"></div>
      }
      <p class="num-tabular text-[22px] font-semibold tracking-[0.12em] text-tinta">
        {{ codigoVisible() }}
      </p>
      <p class="text-[13px] text-plomo">Mostralo al entrar y al salir del estacionamiento.</p>
    </div>
  `,
})
export class QrReserva {
  readonly codigo = input.required<string>();

  protected readonly codigoVisible = computed(() => formatearCodigo(this.codigo()));

  protected readonly imagen = resource({
    params: () => this.codigo(),
    loader: ({ params }) => QRCode.toDataURL(urlDeAcceso(params), { width: 512, margin: 1 }),
  });
}
