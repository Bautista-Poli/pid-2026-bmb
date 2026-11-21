import { ChangeDetectionStrategy, Component, computed, input, resource, signal } from '@angular/core';
import QRCode from 'qrcode';
import { Modal } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { formatearCodigo, urlDeAcceso } from '@app/utils/codigo-acceso.util';

/**
 * Boton "Ver QR" de una reserva, con su modal: el QR y el codigo debajo. El
 * conductor lo muestra al entrar y al salir; si la camara no lo lee, el
 * operador tipea el codigo. La tarjeta solo lo pone: abrir y cerrar es cosa suya.
 */
@Component({
  selector: 'app-ver-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  template: `
    @let r = reserva();
    <button
      type="button"
      class="inline-flex min-h-11 items-center gap-2 rounded-boton px-3 text-[13px] font-semibold
             text-acento transition-colors duration-160 ease-out hover:bg-acento-suave"
      (click)="abierto.set(true)"
    >
      Ver QR
    </button>

    <ui-modal titulo="QR de tu reserva" [abierto]="abierto()" (cerrado)="abierto.set(false)">
      <div class="flex flex-col items-center gap-3 text-center">
        <p class="text-[13px] text-plomo">
          {{ r.estacionamiento.nombre }} · Cochera {{ r.cochera?.identificador ?? 'a asignar' }} ·
          {{ r.horaDesde }}–{{ r.horaHasta }}
        </p>
        @if (imagen.value(); as src) {
          <img [src]="src" alt="QR de la reserva" class="mt-1 size-56 rounded-boton bg-white p-2" />
        } @else {
          <div class="mt-1 size-56 animate-pulse rounded-boton bg-borde-sutil" aria-hidden="true"></div>
        }
        <p class="num-tabular text-[22px] font-semibold tracking-[0.12em] text-tinta">
          {{ codigoVisible() }}
        </p>
        <p class="text-[13px] text-plomo">Mostralo al entrar y al salir del estacionamiento.</p>
      </div>
    </ui-modal>
  `,
})
export class VerQr {
  readonly reserva = input.required<ReservaDetallada>();

  protected readonly abierto = signal(false);

  private readonly codigo = computed(() => this.reserva().codigoAcceso ?? '');
  protected readonly codigoVisible = computed(() => formatearCodigo(this.codigo()));

  /** El QR se dibuja recien al abrir el modal: no hace falta uno por tarjeta de la lista. */
  protected readonly imagen = resource({
    params: () => (this.abierto() ? this.codigo() : undefined),
    loader: ({ params }) => QRCode.toDataURL(urlDeAcceso(params), { width: 512, margin: 1 }),
  });
}
