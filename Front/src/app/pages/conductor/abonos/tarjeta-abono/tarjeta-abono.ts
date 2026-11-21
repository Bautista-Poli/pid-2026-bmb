import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boton, Tarjeta } from '@app/components/ui';
import { Abono, TURNOS } from '@app/models';

/**
 * Un abono de Mis abonos (abonos.ts): estacionamiento, turno, vencimiento y
 * usos que le quedan. Si esta vigente, deja reservar con el o cancelarlo.
 */
@Component({
  selector: 'app-tarjeta-abono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Boton, Tarjeta],
  templateUrl: './tarjeta-abono.html',
  styleUrl: './tarjeta-abono.css',
})
export class TarjetaAbono {
  readonly abono = input.required<Abono>();

  readonly cancelar = output<Abono>();

  protected readonly turnos = TURNOS;
}
