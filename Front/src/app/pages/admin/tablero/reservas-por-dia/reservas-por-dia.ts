import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BarraDia, BarrasDia } from '@app/components/estadistica';
import { Tarjeta } from '@app/components/ui';
import { EstadisticasAdmin } from '@app/models';
import { diaDelMes, diaYMes } from '../formato';

/** Tramos de las barras de reservas por dia, de abajo hacia arriba. */
const TRAMOS_RESERVAS = [
  { clave: 'finalizadas', clase: 'bg-exito', etiqueta: 'Finalizadas' },
  { clave: 'enCurso', clase: 'bg-acento', etiqueta: 'En curso' },
  { clave: 'confirmadas', clase: 'bg-acento/40', etiqueta: 'Confirmadas' },
  { clave: 'pendientes', clase: 'bg-baja', etiqueta: 'Pendientes' },
  { clave: 'canceladas', clase: 'bg-ocupada/70', etiqueta: 'Canceladas' },
  { clave: 'ausentes', clase: 'bg-humo', etiqueta: 'Ausentes' },
] as const;

/** "Reservas por dia" del tablero de admin (tablero.ts): todas las de la plataforma, apiladas por estado. */
@Component({
  selector: 'app-reservas-por-dia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarrasDia, Tarjeta],
  templateUrl: './reservas-por-dia.html',
  styleUrls: ['../compartido.css', './reservas-por-dia.css'],
  host: { style: 'display: contents' },
})
export class ReservasPorDia {
  readonly datos = input.required<EstadisticasAdmin>();

  protected readonly tramosReservas = TRAMOS_RESERVAS;

  protected readonly barrasReservas = computed<BarraDia[]>(() =>
    this.datos().actividad.reservasPorDia.map((d) => {
      const partes = TRAMOS_RESERVAS.filter((t) => d[t.clave] > 0).map((t) => `${t.etiqueta} ${d[t.clave]}`);
      return {
        clave: d.fecha,
        etiqueta: diaDelMes(d.fecha),
        tramos: TRAMOS_RESERVAS.map((t) => ({ valor: d[t.clave], clase: t.clase, etiqueta: t.etiqueta })),
        detalle: `${diaYMes(d.fecha)} · ${partes.length > 0 ? partes.join(' · ') : 'Sin reservas'}`,
      };
    }),
  );

  protected readonly hayReservas = computed(() => this.barrasReservas().some((b) => b.tramos.some((t) => t.valor > 0)));
}
