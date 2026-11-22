import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EstadoReserva } from '@app/components/reserva';
import { Boton, EstadoVacio, Icono, Tarjeta } from '@app/components/ui';
import { cruzaMedianoche, formatearNota, ReservaDetallada, reservaSinUsar, TURNOS } from '@app/models';
import { FechaReserva } from '../partes-tarjeta/fecha-reserva/fecha-reserva';

interface MesHistorial {
  clave: string;
  titulo: string;
  reservas: ReservaDetallada[];
}

const MES_Y_ANIO = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

/**
 * Pestaña "Historial" de Mis reservas: las reservas pasadas agrupadas por mes,
 * lo mas reciente primero. Las que no se usaron (canceladas, expiradas y
 * ausentes) se ven solo si el conductor lo pide.
 *
 * Cada fila muestra fecha, estacionamiento, horario, estado y precio; si ya la
 * uso, tambien el acceso a calificarla (o la nota que le puso).
 */
@Component({
  selector: 'app-historial-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Boton, EstadoVacio, Icono, Tarjeta, EstadoReserva, FechaReserva],
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
    this.mostrarSinUsar() ? this.reservas() : this.reservas().filter((reserva) => !reservaSinUsar(reserva)),
  );

  protected readonly cantidadVisibles = computed(() => this.visibles().length);
  protected readonly cantidadSinUsar = computed(() => this.reservas().filter(reservaSinUsar).length);

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

  /* --------------------------- Lo que muestra cada fila --------------------------- */

  protected readonly sinUsar = reservaSinUsar;
  protected readonly cruzaMedianoche = cruzaMedianoche;

  /** "$ 6.000", o "Abono · Turno mañana" si se reservo con un abono. */
  protected precio(reserva: ReservaDetallada): string {
    return reserva.abono
      ? `Abono · Turno ${TURNOS[reserva.abono.turno].etiqueta.toLowerCase()}`
      : `$ ${reserva.precioTotal.toLocaleString('es-AR')}`;
  }

  /** La nota que ya le puso ("4,5"), o null si todavia no la califico. */
  protected nota(reserva: ReservaDetallada): string | null {
    return reserva.calificacionPromedio == null ? null : formatearNota(reserva.calificacionPromedio);
  }
}
