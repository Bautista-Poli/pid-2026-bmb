import { Observable } from 'rxjs';
import { esReservaActiva, Reserva, ReservaDetallada } from '@app/models';
import { aInstante } from '@app/utils/fecha.util';
import { ReservaService } from './reserva.service';

/**
 * Una reserva sigue en juego si su estado lo permite y su franja todavia no
 * termino. El backend no cierra sola a la que nadie ingreso, asi que sin la
 * segunda condicion quedaria para siempre entre las vigentes.
 */
export function reservaEnJuego(reserva: Reserva): boolean {
  const fin = Date.parse(aInstante(reserva.fechaHasta, reserva.horaHasta));
  return esReservaActiva(reserva) && fin > Date.now();
}

/**
 * El paso siguiente del ciclo de una reserva, con el aviso que se le muestra
 * al propietario cuando sale bien. Lo comparten el panel y "Reservas
 * recibidas", que ofrecen los mismos botones.
 */
export interface PasoReserva {
  llamada: Observable<Reserva>;
  aviso: string;
}

export function avanzarReserva(
  servicio: ReservaService,
  reserva: ReservaDetallada,
): PasoReserva | null {
  const patente = reserva.vehiculo.patente;

  switch (reserva.estado) {
    case 'PENDIENTE':
      return {
        llamada: servicio.confirmar(reserva.id),
        aviso: `Confirmaste la reserva de ${patente}.`,
      };
    case 'CONFIRMADA':
      return {
        llamada: servicio.registrarIngreso(reserva.id),
        aviso: `Registraste el ingreso de ${patente}.`,
      };
    case 'EN_CURSO':
      return {
        llamada: servicio.registrarEgreso(reserva.id),
        aviso: `Registraste el egreso de ${patente}. La reserva quedó finalizada.`,
      };
    default:
      return null;
  }
}
