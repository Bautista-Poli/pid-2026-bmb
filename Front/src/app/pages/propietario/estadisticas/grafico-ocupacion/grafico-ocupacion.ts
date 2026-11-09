import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BarraDia, BarrasDia } from '@app/components/estadistica';
import { Tarjeta } from '@app/components/ui';
import { EstadisticasPropietario } from '@app/models';
import { diaDelMes, diaYMes } from '../formato';

/** Ocupacion por dia de Estadisticas (estadisticas.ts): horas usadas sobre las que abren las cocheras. */
@Component({
  selector: 'app-grafico-ocupacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarrasDia, Tarjeta],
  templateUrl: './grafico-ocupacion.html',
  styleUrls: ['../compartido.css', './grafico-ocupacion.css'],
  host: { style: 'display: contents' },
})
export class GraficoOcupacion {
  readonly datos = input.required<EstadisticasPropietario>();

  protected readonly barrasOcupacion = computed<BarraDia[]>(() =>
    this.datos().ocupacionPorDia.map((d) => ({
      clave: d.fecha,
      etiqueta: diaDelMes(d.fecha),
      tramos: [
        { valor: d.horasUsadas, clase: 'bg-acento', etiqueta: 'usadas' },
        { valor: Math.max(0, d.horasOfrecidas - d.horasUsadas), clase: 'bg-acento/20', etiqueta: 'libres' },
      ],
      detalle: `${diaYMes(d.fecha)} · ${d.horasUsadas} h usadas de ${d.horasOfrecidas} h`,
    })),
  );

  protected readonly hayOcupacion = computed(() => this.datos().ocupacionPorDia.some((d) => d.horasOfrecidas > 0));
}
