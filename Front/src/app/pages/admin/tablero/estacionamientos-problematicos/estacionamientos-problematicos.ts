import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import { ETIQUETA_RAZON_PROBLEMATICO, EstadisticasAdmin } from '@app/models';
import { porciento } from '../formato';

/**
 * "Estacionamientos con problemas" del tablero de admin (tablero.ts): los que
 * cancelan mucho por su lado o juntan reclamos, con sus razones.
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

  protected readonly etiquetaRazon = ETIQUETA_RAZON_PROBLEMATICO;
  protected readonly porciento = porciento;
}
