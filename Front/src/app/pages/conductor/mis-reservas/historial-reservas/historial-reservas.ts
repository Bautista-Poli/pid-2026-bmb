import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boton, EstadoVacio, Tarjeta } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { TarjetaHistorial } from './tarjeta-historial/tarjeta-historial';

interface MesHistorial {
  clave: string;
  titulo: string;
  reservas: ReservaDetallada[];
}

const MES_Y_ANIO = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

/**
 * Reservas que no llegaron a usarse (canceladas, expiradas y ausentes): en el
 * historial quedan ocultas hasta que el conductor pide verlas.
 */
export const sinUsar = (reserva: ReservaDetallada) =>
  reserva.estado === 'CANCELADA' || reserva.estado === 'NO_SHOW';

/**
 * Pestaña "Historial" de Mis reservas: las reservas pasadas agrupadas por mes,
 * lo mas reciente primero. Las que no se usaron se ven solo si el conductor lo pide.
 */
@Component({
  selector: 'app-historial-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TarjetaHistorial, Tarjeta, EstadoVacio, Boton, RouterLink],
  templateUrl: './historial-reservas.html',
  styleUrl: './historial-reservas.css',
})
export class HistorialReservas {
  /** Reservas pasadas, ya ordenadas de la mas reciente a la mas vieja. */
  readonly reservas = input.required<ReservaDetallada[]>();

  /**
   * Si se muestran tambien las canceladas, expiradas y ausentes. Lo guarda la
   * pantalla: el contador de la pestaña depende de esto.
   */
  readonly mostrarSinUsar = model(false);

  private readonly visibles = computed(() =>
    this.mostrarSinUsar() ? this.reservas() : this.reservas().filter((reserva) => !sinUsar(reserva)),
  );

  protected readonly cantidadVisibles = computed(() => this.visibles().length);
  protected readonly cantidadSinUsar = computed(() => this.reservas().filter(sinUsar).length);

  protected readonly meses = computed<MesHistorial[]>(() => {
    const meses: MesHistorial[] = [];
    for (const reserva of this.visibles()) {
      const clave = reserva.fecha.slice(0, 7);
      let mes = meses.at(-1);
      if (mes?.clave !== clave) {
        const [anio, numero] = clave.split('-').map(Number);
        mes = { clave, titulo: MES_Y_ANIO.format(new Date(anio, numero - 1, 1)), reservas: [] };
        meses.push(mes);
      }
      mes.reservas.push(reserva);
    }
    return meses;
  });
}
