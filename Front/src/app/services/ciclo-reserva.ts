import { Observable } from 'rxjs';
import { esReservaActiva, Reserva, ReservaDetallada } from '@app/models';
import { aInstante } from '@app/utils/fecha.util';
import { ReservaService } from './reserva.service';

/** Mismo margen que el backend: el ingreso se registra desde 30 min antes del inicio. */
const MARGEN_INGRESO_MS = 30 * 60 * 1000;

/**
 * El ingreso solo se registra dentro de la franja: desde 30 min antes del
 * inicio hasta el fin. Fuera de esa ventana el backend lo rechaza.
 */
export function ingresoHabilitado(reserva: Reserva, ahora = Date.now()): boolean {
  const inicio = Date.parse(aInstante(reserva.fecha, reserva.horaDesde));
  const fin = Date.parse(aInstante(reserva.fechaHasta, reserva.horaHasta));
  return ahora >= inicio - MARGEN_INGRESO_MS && ahora < fin;
}

/**
 * Si el propietario puede avanzar la reserva en este momento. Una confirmada
 * solo habilita el ingreso dentro de su ventana; el resto de los pasos siempre.
 */
export function puedeAvanzar(reserva: Reserva): boolean {
  return reserva.estado !== 'CONFIRMADA' || ingresoHabilitado(reserva);
}

/**
 * Ingreso y egreso se registran desde la pantalla de acceso, con el codigo o el
 * QR de la reserva: el operador confirma ahi antes de que se guarde. Devuelve la
 * ruta de esa pantalla, o null si el paso no es de acceso.
 */
export function rutaAcceso(reserva: Reserva): string[] | null {
  if (reserva.estado !== 'CONFIRMADA' && reserva.estado !== 'ACTIVA') return null;
  return ['/propietario/acceso', reserva.codigoAcceso];
}

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

  if (!puedeAvanzar(reserva)) return null;

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
    case 'ACTIVA':
      return {
        llamada: servicio.registrarEgreso(reserva.id),
        aviso: `Registraste el egreso de ${patente}. La reserva quedó finalizada.`,
      };
    default:
      return null;
  }
}
