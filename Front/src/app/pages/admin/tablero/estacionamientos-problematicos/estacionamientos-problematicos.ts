import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import { EstadisticasAdmin } from '@app/models';
import { porciento } from '../formato';

/**
 * "Estacionamientos con problemas" del tablero de admin (tablero.ts): los que
 * cancelan mucho por su lado.
 */
@Component({
  selector: 'app-estacionamientos-problematicos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tarjeta],
  templateUrl: './estacionamientos-problematicos.html',
  styleUrls: ['../compartido.css', './estacionamientos-problematicos.css'],
  host: { style: 'display: contents' },
})
export class EstacionamientosProblematicos {
  readonly datos = input.required<EstadisticasAdmin>();

  protected readonly porciento = porciento;
}
