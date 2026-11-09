import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import { EstadisticasAdmin } from '@app/models';
import { pesos } from '../formato';

type FilaRanking = EstadisticasAdmin['actividad']['topPorReservas'][number];

/** Un ranking del tablero de admin (tablero.ts): "Más reservas" o "Más ingresos". */
@Component({
  selector: 'app-ranking-estacionamientos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tarjeta],
  templateUrl: './ranking-estacionamientos.html',
  styleUrls: ['../compartido.css', './ranking-estacionamientos.css'],
  host: { style: 'display: contents' },
})
export class RankingEstacionamientos {
  readonly titulo = input.required<string>();
  readonly filas = input.required<FilaRanking[]>();
  /** El valor es plata ("$ 12.500") en vez de una cantidad. */
  readonly plata = input(false);

  protected readonly pesos = pesos;
}
