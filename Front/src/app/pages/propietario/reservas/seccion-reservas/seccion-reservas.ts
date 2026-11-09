import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Etiqueta, Icono, NombreIcono, Tarjeta, TonoEtiqueta } from '@app/components/ui';
import {
  EstadoReserva,
  esExpirada,
  etiquetaReserva,
  ETIQUETA_TIPO_VEHICULO,
  Id,
  ReservaDetallada,
  TipoVehiculo,
} from '@app/models';
import { avanzaConCodigo, puedeAvanzar, puedeMarcarAusente } from '@app/services/ciclo-reserva';
import { desdeFechaISO } from '@app/utils/fecha.util';

const TONO_ESTADO: Record<EstadoReserva, TonoEtiqueta> = {
  PENDIENTE: 'aviso',
  CONFIRMADA: 'acento',
  ACTIVA: 'exito',
  FINALIZADA: 'neutro',
  CANCELADA: 'peligro',
  NO_SHOW: 'peligro',
};

const ICONO_VEHICULO: Record<TipoVehiculo, NombreIcono> = {
  AUTO: 'auto',
  CAMIONETA: 'camioneta',
  MOTO: 'moto',
};

/** Que puede hacer el propietario desde la lista (ingreso y egreso van con el codigo). */
const PASOS: Partial<Record<EstadoReserva, string>> = {
  PENDIENTE: 'Confirmar',
};

/**
 * Una seccion de Reservas (reservas.ts), por ejemplo "Pendientes": en desktop
 * una tabla y en mobile una lista de tarjetas. Las acciones (confirmar, marcar
 * ausente, calificar al conductor) se avisan a la pantalla, que las hace.
 */
@Component({
  selector: 'app-seccion-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, Etiqueta, Icono, Tarjeta],
  templateUrl: './seccion-reservas.html',
  styleUrl: './seccion-reservas.css',
  host: { style: 'display: contents' },
})
export class SeccionReservas {
  readonly titulo = input.required<string>();
  readonly reservas = input.required<ReservaDetallada[]>();
  /** Reserva que se esta procesando: pinta el spinner en su fila. */
  readonly procesandoId = input<Id | null>(null);

  readonly avanzar = output<ReservaDetallada>();
  readonly marcarAusente = output<ReservaDetallada>();
  readonly calificar = output<ReservaDetallada>();

  protected readonly etiquetaEstado = etiquetaReserva;
  protected readonly iconoVehiculo = ICONO_VEHICULO;
  protected readonly avanzaConCodigo = avanzaConCodigo;
  protected readonly puedeMarcarAusente = (reserva: ReservaDetallada) => puedeMarcarAusente(reserva);
  protected readonly desdeFechaISO = desdeFechaISO;

  /** Expirada (no la confirmaste a tiempo) en amarillo, distinta de una cancelacion. */
  protected tonoEstado(reserva: ReservaDetallada): TonoEtiqueta {
    return esExpirada(reserva) ? 'aviso' : TONO_ESTADO[reserva.estado];
  }

  /** El boton del paso siguiente (solo confirmar), o null si no hay. */
  protected pasoDe(reserva: ReservaDetallada): string | null {
    return puedeAvanzar(reserva) ? (PASOS[reserva.estado] ?? null) : null;
  }

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

  /** Si la fila ya muestra el boton de calificar o la nota dada (asi no va el "—"). */
  protected conAccionDeCalificar(reserva: ReservaDetallada): boolean {
    return reserva.conductorCalificable || reserva.calificacionAlConductor !== null;
  }
}
