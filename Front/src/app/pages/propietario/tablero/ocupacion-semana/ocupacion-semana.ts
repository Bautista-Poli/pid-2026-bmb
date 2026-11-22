import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import { Estacionamiento, ReservaDetallada } from '@app/models';
import { aFechaISO, hoyISO } from '@app/utils/fecha.util';
import { contarCocheras, reservasDelDia } from '../calculos';

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface DiaOcupacion {
  fecha: string;
  etiqueta: string;
  esHoy: boolean;
  ocupadas: number;
  libres: number;
}

/**
 * Grafico de barras del tablero (tablero.ts): por cada dia de la semana, las
 * cocheras ocupadas y las disponibles, con un tooltip al pasar el mouse.
 *
 * Se arregla solo: recibe los estacionamientos y las reservas tal como llegan
 * y arma la semana actual (lunes a domingo).
 *
 *   <app-ocupacion-semana [estacionamientos]="lista" [reservas]="reservas" [cargando]="..." />
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
  readonly estacionamientos = input.required<Estacionamiento[]>();
  readonly reservas = input.required<ReservaDetallada[]>();
  /** Mientras llegan las reservas se muestra el esqueleto del grafico. */
  readonly cargando = input(false);

  /** Cocheras activas de todos los estacionamientos: el alto del eje Y. */
  private readonly totalCocheras = computed(() => contarCocheras(this.estacionamientos()).total);

  /**
   * Ocupacion de la semana actual (lunes a domingo): cocheras con al menos una
   * reserva vigente cada dia, sobre el total de cocheras activas.
   */
  protected readonly semana = computed<DiaOcupacion[]>(() => {
    const total = this.totalCocheras();
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));

    return Array.from({ length: 7 }, (_, i) => {
      const dia = new Date(lunes);
      dia.setDate(lunes.getDate() + i);
      const fecha = aFechaISO(dia);
      const cocheras = new Set(reservasDelDia(this.reservas(), fecha).map((r) => r.cocheraId ?? r.id));
      const ocupadas = Math.min(cocheras.size, total);
      return {
        fecha,
        etiqueta: `${DIAS_CORTOS[dia.getDay()]} ${dia.getDate()}`,
        esHoy: fecha === hoyISO(),
        ocupadas,
        libres: total - ocupadas,
      };
    });
  });

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
