import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EstadoReserva } from '@app/components/reserva';
import { Boton, EstadoVacio, Icono } from '@app/components/ui';
import { cruzaMedianoche, direccionCorta, ReservaDetallada } from '@app/models';
import { DetalleReserva } from '../partes-tarjeta/detalle-reserva/detalle-reserva';
import { FechaReserva } from '../partes-tarjeta/fecha-reserva/fecha-reserva';
import { VerQr } from '../partes-tarjeta/ver-qr/ver-qr';
import { CancelarReserva } from './cancelar-reserva/cancelar-reserva';

/**
 * Pestaña "Próximas" de Mis reservas: una tarjeta por cada reserva pendiente o
 * confirmada que todavia no empezo, de la mas cercana a la mas lejana. Cada
 * tarjeta dice cuando es y donde; el resto (auto, cochera, como llegar y
 * precio) lo pone detalle-reserva.
 *
 * Ver el QR y cancelar son botones que se arreglan solos (ver-qr y
 * cancelar-reserva): la pestaña solo avisa cual se cancelo.
 */
@Component({
  selector: 'app-reservas-proximas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Boton, EstadoVacio, Icono, EstadoReserva, FechaReserva, DetalleReserva, VerQr, CancelarReserva],
  templateUrl: './reservas-proximas.html',
  styleUrl: './reservas-proximas.css',
})
export class ReservasProximas {
  /** Reservas que todavia no empezaron, ya ordenadas de la mas cercana a la mas lejana. */
  readonly reservas = input.required<ReservaDetallada[]>();

  /** La reserva ya se cancelo en el back: la pantalla avisa y recarga la lista. */
  readonly cancelada = output<ReservaDetallada>();

  protected readonly direccion = (reserva: ReservaDetallada) => direccionCorta(reserva.estacionamiento.direccion);
  protected readonly cruzaMedianoche = cruzaMedianoche;
}
