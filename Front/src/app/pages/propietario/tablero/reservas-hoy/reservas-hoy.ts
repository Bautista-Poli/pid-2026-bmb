import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { puedeAvanzar } from '@app/services/ciclo-reserva';

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

const PASOS: Partial<Record<EstadoReserva, string>> = {
  PENDIENTE: 'Confirmar',
};

/**
 * Reservas de hoy en el tablero (tablero.ts): las primeras 6, con su estado.
 * Una pendiente se puede confirmar desde aca (`avanzar`); ingreso y egreso
 * van solo con el codigo.
 */
@Component({
  selector: 'app-reservas-hoy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Etiqueta, Icono, Tarjeta],
  templateUrl: './reservas-hoy.html',
  styleUrls: ['../compartido.css', './reservas-hoy.css'],
  host: { style: 'display: contents' },
})
export class ReservasHoy {
  readonly reservas = input.required<ReservaDetallada[]>();
  readonly cargando = input(false);
  /** Reserva que se esta confirmando: su boton dice "Guardando…". */
  readonly procesandoId = input<Id | null>(null);

  readonly avanzar = output<ReservaDetallada>();

  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly etiquetaEstado = etiquetaReserva;
  protected readonly iconoVehiculo = ICONO_VEHICULO;

  protected tonoEstado(reserva: ReservaDetallada): TonoEtiqueta {
    return esExpirada(reserva) ? 'aviso' : TONO_ESTADO[reserva.estado];
  }

  protected pasoDe(reserva: ReservaDetallada): string | null {
    return puedeAvanzar(reserva) ? (PASOS[reserva.estado] ?? null) : null;
  }
}
