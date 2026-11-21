import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icono } from '@app/components/ui';
import { direccionCorta, ReservaDetallada } from '@app/models';
import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { AvisoReasignacion } from '../../partes-tarjeta/aviso-reasignacion';
import { EstadoReserva } from '../../partes-tarjeta/estado-reserva';
import { FechaReserva } from '../../partes-tarjeta/fecha-reserva';
import { ComoLlegar } from '../partes-tarjeta/como-llegar';
import { PrecioReserva } from '../partes-tarjeta/precio-reserva';
import { VehiculoYCochera } from '../partes-tarjeta/vehiculo-y-cochera';
import { VerQr } from '../ver-qr/ver-qr';

/**
 * Tarjeta de una reserva proxima del conductor (pendiente o confirmada, todavia
 * sin ingreso): cuando es, donde, con que auto, y las acciones de ver el QR y
 * cancelarla.
 */
@Component({
  selector: 'app-tarjeta-proxima',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Icono,
    EstadoReserva,
    AvisoReasignacion,
    FechaReserva,
    VehiculoYCochera,
    ComoLlegar,
    PrecioReserva,
    VerQr,
  ],
  templateUrl: './tarjeta-proxima.html',
  styleUrl: './tarjeta-proxima.css',
})
export class TarjetaProxima {
  readonly reserva = input.required<ReservaDetallada>();
  readonly cancelando = input(false);

  readonly cancelar = output<ReservaDetallada>();

  /** El QR recien sirve para entrar cuando el estacionamiento confirmo la reserva. */
  protected readonly conQr = computed(
    () => this.reserva().estado === 'CONFIRMADA' && reservaEnJuego(this.reserva()),
  );

  /** El conductor no puede cancelar una reserva que ya paso. */
  protected readonly cancelable = computed(() => reservaEnJuego(this.reserva()));

  protected readonly direccion = computed(() =>
    direccionCorta(this.reserva().estacionamiento.direccion),
  );

  protected readonly cruzaMedianoche = computed(
    () => this.reserva().fechaHasta !== this.reserva().fecha,
  );
}
