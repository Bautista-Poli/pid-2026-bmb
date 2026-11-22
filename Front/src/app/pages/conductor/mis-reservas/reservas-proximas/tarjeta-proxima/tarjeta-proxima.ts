import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { EstadoReserva } from '@app/components/reserva';
import { Icono } from '@app/components/ui';
import { cruzaMedianoche, direccionCorta, ReservaDetallada } from '@app/models';
import { AvisoReasignacion } from '../../partes-tarjeta/aviso-reasignacion';
import { FechaReserva } from '../../partes-tarjeta/fecha-reserva';
import { ComoLlegar } from '../../partes-tarjeta/como-llegar';
import { PrecioReserva } from '../../partes-tarjeta/precio-reserva';
import { VehiculoYCochera } from '../../partes-tarjeta/vehiculo-y-cochera';
import { VerQr } from '../../partes-tarjeta/ver-qr';
import { CancelarReserva } from '../cancelar-reserva/cancelar-reserva';

/**
 * Tarjeta de una reserva proxima del conductor (pendiente o confirmada, todavia
 * sin ingreso): cuando es, donde y con que auto. Ver el QR y cancelarla son
 * dos botones que se arreglan solos (ver-qr y cancelar-reserva): la tarjeta
 * los pone y avisa cuando la reserva quedo cancelada.
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
    CancelarReserva,
  ],
  templateUrl: './tarjeta-proxima.html',
  styleUrl: './tarjeta-proxima.css',
})
export class TarjetaProxima {
  readonly reserva = input.required<ReservaDetallada>();

  /** La reserva ya se cancelo en el back. */
  readonly cancelada = output<ReservaDetallada>();

  protected readonly direccion = computed(() =>
    direccionCorta(this.reserva().estacionamiento.direccion),
  );

  protected readonly cruzaMedianoche = computed(() => cruzaMedianoche(this.reserva()));
}
