import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import { IncidenciaModerada } from '@app/models';
import { pesos } from '../formato';

/**
 * Resumen de una disputa (disputa.ts) para decidir: lo pagado, lo devuelto, el
 * tope, lo que pide cada parte y los horarios reales de la reserva o el abono.
 */
@Component({
  selector: 'app-resumen-disputa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Tarjeta],
  templateUrl: './resumen-disputa.html',
  styleUrl: './resumen-disputa.css',
  host: { style: 'display: contents' },
})
export class ResumenDisputa {
  readonly d = input.required<IncidenciaModerada>();

  protected readonly pesos = pesos;
}
