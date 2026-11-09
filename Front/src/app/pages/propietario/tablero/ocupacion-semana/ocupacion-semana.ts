import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';

export interface DiaOcupacion {
  fecha: string;
  etiqueta: string;
  esHoy: boolean;
  ocupadas: number;
  libres: number;
}

/**
 * Grafico de barras del tablero (tablero.ts): por cada dia de la semana, las
 * cocheras ocupadas y las disponibles, con un tooltip al pasar el mouse.
 */
@Component({
  selector: 'app-ocupacion-semana',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tarjeta],
  templateUrl: './ocupacion-semana.html',
  styleUrls: ['../compartido.css', './ocupacion-semana.css'],
  host: { style: 'display: contents' },
})
export class OcupacionSemana {
  readonly semana = input.required<DiaOcupacion[]>();
  /** Cocheras activas de todos los estacionamientos: el alto del eje Y. */
  readonly totalCocheras = input(0);
  readonly cargando = input(false);

  /** Escala del eje Y: 4 tramos redondos que cubren el total de cocheras. */
  protected readonly escala = computed(() => {
    const total = Math.max(this.totalCocheras(), 1);
    const tramo = total / 4;
    const paso = tramo <= 5 ? Math.ceil(tramo) : Math.ceil(tramo / 5) * 5;
    const tope = paso * 4;
    return { tope, marcas: [4, 3, 2, 1, 0].map((n) => n * paso) };
  });

  protected alto(valor: number): string {
    return `${(valor / this.escala().tope) * 100}%`;
  }
}
