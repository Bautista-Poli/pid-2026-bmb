import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ConfirmarReserva, EstadoReserva, ResultadoReserva } from '@app/components/reserva';
import { Icono, Tarjeta } from '@app/components/ui';
import { ETIQUETA_TIPO_VEHICULO, ICONO_TIPO_VEHICULO, ReservaDetallada } from '@app/models';
import { avanzaConCodigo, puedeAvanzar, puedeMarcarAusente } from '@app/services/ciclo-reserva';
import { desdeFechaISO } from '@app/utils/fecha.util';

/**
 * Una seccion de Reservas (reservas.ts), por ejemplo "Pendientes": en desktop
 * una tabla y en mobile una lista de tarjetas.
 *
 * Confirmar una pendiente lo hace el boton solo (components/reserva); a la
 * pantalla le llega como termino (`confirmada`). Marcar ausente y calificar al
 * conductor abren un modal de la pantalla: la seccion avisa sobre que reserva.
 */
@Component({
  selector: 'app-seccion-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ConfirmarReserva, EstadoReserva, Icono, Tarjeta],
  templateUrl: './seccion-reservas.html',
  styleUrl: './seccion-reservas.css',
  host: { style: 'display: contents' },
})
export class SeccionReservas {
  readonly titulo = input.required<string>();
  readonly reservas = input.required<ReservaDetallada[]>();

  /** Como termino la confirmacion de una pendiente: aviso o error. */
  readonly confirmada = output<ResultadoReserva>();
  readonly marcarAusente = output<ReservaDetallada>();
  readonly calificar = output<ReservaDetallada>();

  protected readonly iconoVehiculo = ICONO_TIPO_VEHICULO;
  protected readonly puedeMarcarAusente = (reserva: ReservaDetallada) => puedeMarcarAusente(reserva);
  protected readonly desdeFechaISO = desdeFechaISO;

  protected vehiculo(reserva: ReservaDetallada): string {
    const nombre = [reserva.vehiculo.marca, reserva.vehiculo.modelo].filter(Boolean).join(' ');
    return nombre || ETIQUETA_TIPO_VEHICULO[reserva.vehiculo.tipo];
  }

  /** "★ 4,6 (12)", o null si todavia nadie lo califico. */
  protected reputacionConductor(reserva: ReservaDetallada): string | null {
    const { promedio, cantidad } = reserva.reputacionConductor;
    if (promedio === null || cantidad === 0) return null;
    return `★ ${promedio.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${cantidad})`;
  }

  /**
   * Que se muestra cuando la fila no tiene ningun boton: "Con el código" si
   * el ingreso o el egreso se registran con el codigo del conductor, un guion
   * si ya no hay nada para hacer, o nada si la fila si tiene alguna accion.
   */
  protected sinAcciones(reserva: ReservaDetallada): 'CODIGO' | 'NADA' | null {
    const calificacion = reserva.conductorCalificable || reserva.calificacionAlConductor !== null;
    if (puedeAvanzar(reserva) || puedeMarcarAusente(reserva) || calificacion) return null;
    return avanzaConCodigo(reserva) ? 'CODIGO' : 'NADA';
  }
}
