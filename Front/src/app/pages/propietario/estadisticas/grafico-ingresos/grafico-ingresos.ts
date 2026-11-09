import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BarraDia, BarrasDia } from '@app/components/estadistica';
import { Tarjeta } from '@app/components/ui';
import { EstadisticasPropietario } from '@app/models';
import { diaDelMes, diaYMes, pesos } from '../formato';

/** Ingresos (simulados) por dia de Estadisticas (estadisticas.ts): reservas y abonos, neto de devoluciones. */
@Component({
  selector: 'app-grafico-ingresos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarrasDia, Tarjeta],
  templateUrl: './grafico-ingresos.html',
  styleUrls: ['../compartido.css', './grafico-ingresos.css'],
  host: { style: 'display: contents' },
})
export class GraficoIngresos {
  readonly datos = input.required<EstadisticasPropietario>();

  protected readonly pesos = pesos;

  protected readonly barrasIngresos = computed<BarraDia[]>(() =>
    this.datos().ingresosPorDia.map((d) => ({
      clave: d.fecha,
      etiqueta: diaDelMes(d.fecha),
      tramos: [
        { valor: d.reservas, clase: 'bg-exito', etiqueta: 'reservas' },
        { valor: d.abonos, clase: 'bg-violet-500', etiqueta: 'abonos' },
      ],
      detalle:
        `${diaYMes(d.fecha)} · Reservas ${pesos(d.reservas)} · Abonos ${pesos(d.abonos)}` +
        (d.devoluciones > 0 ? ` · − ${pesos(d.devoluciones)} devuelto` : ''),
    })),
  );

  protected readonly hayIngresos = computed(() => this.barrasIngresos().some((b) => b.tramos.some((t) => t.valor > 0)));
}
