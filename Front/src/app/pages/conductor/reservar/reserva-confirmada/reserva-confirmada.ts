import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boton, Tarjeta } from '@app/components/ui';
import { Reserva } from '@app/models';
import { desdeFechaISO } from '@app/utils/fecha.util';
import { ReservaHecha } from './reserva-hecha/reserva-hecha';

/**
 * Lo que ve el conductor apenas reserva (reservar.ts): la animacion, el dia y
 * la franja, la cochera asignada y el total, con los accesos a Mis reservas y
 * a Explorar.
 */
@Component({
  selector: 'app-reserva-confirmada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, ReservaHecha, Tarjeta, Boton],
  templateUrl: './reserva-confirmada.html',
  styleUrl: './reserva-confirmada.css',
})
export class ReservaConfirmada {
  readonly reserva = input.required<Reserva>();
  /** Nombre del estacionamiento. */
  readonly estacionamiento = input.required<string>();

  protected readonly desdeFechaISO = desdeFechaISO;
}
