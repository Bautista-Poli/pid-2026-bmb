import { Observable } from 'rxjs';
import { esReservaActiva, Reserva, ReservaDetallada } from '@app/models';
import { aInstante } from '@app/utils/fecha.util';
import { ReservaService } from './reserva.service';

/**
 * Misma tolerancia que el backend (TOLERANCIA_NO_SHOW_MS): sin ingreso a los
 * 15 min del inicio, la reserva pasa a NO_SHOW y la cochera se libera.
 */
export const TOLERANCIA_NO_SHOW_MS = 15 * 60 * 1000;

const inicioDe = (reserva: Reserva) => Date.parse(aInstante(reserva.fecha, reserva.horaDesde));
const finDe = (reserva: Reserva) => Date.parse(aInstante(reserva.fechaHasta, reserva.horaHasta));

/** Ultimo instante en que se acepta el ingreso: inicio + tolerancia, sin pasar del fin. */
export function limiteIngreso(reserva: Reserva): number {
  return Math.min(inicioDe(reserva) + TOLERANCIA_NO_SHOW_MS, finDe(reserva));
}

/**
 * El propietario puede marcar ausente a mano una confirmada sin ingreso desde
 * su inicio hasta su fin (mismo criterio que el backend). Antes del inicio
 * todavia puede llegar; despues de la tolerancia lo hace el job igual.
 */
export function puedeMarcarAusente(reserva: Reserva, ahora = Date.now()): boolean {
  return reserva.estado === 'CONFIRMADA' && ahora >= inicioDe(reserva) && ahora < finDe(reserva);
}

/**
 * Si el propietario tiene un boton para avanzar la reserva: solo confirmar una
 * pendiente. El ingreso y el egreso no se registran desde las listas: solo con
 * el codigo que muestra el conductor (QR o "Ingresar codigo" en el tablero).
 */
export function puedeAvanzar(reserva: Reserva): boolean {
  return reserva.estado === 'PENDIENTE';
}

/** Una confirmada o en curso avanza solo con el codigo de acceso del conductor. */
export function avanzaConCodigo(reserva: Reserva): boolean {
  return reserva.estado === 'CONFIRMADA' || reserva.estado === 'ACTIVA';
}

/**
 * Una reserva sigue en juego si su estado lo permite y su franja todavia no
 * termino. Una confirmada sin ingreso deja de estarlo al vencer la tolerancia:
 * el backend la pasa a NO_SHOW en el minuto siguiente, pero la pantalla no
 * espera a recargar para sacarla de las vigentes.
 */
export function reservaEnJuego(reserva: Reserva): boolean {
  // Sin parametro `ahora`: se usa como callback de `.filter`, que pasaria el indice.
  const ahora = Date.now();
  if (!esReservaActiva(reserva) || finDe(reserva) <= ahora) return false;
  return reserva.estado !== 'CONFIRMADA' || ahora <= limiteIngreso(reserva);
}

/**
 * El paso siguiente del ciclo de una reserva, con el aviso que se le muestra
 * al propietario cuando sale bien. Lo comparten el panel y "Reservas
 * recibidas", que ofrecen el mismo boton (Confirmar).
 */
export interface PasoReserva {
  llamada: Observable<Reserva>;
  aviso: string;
}

export function avanzarReserva(
  servicio: ReservaService,
  reserva: ReservaDetallada,
): PasoReserva | null {
  if (!puedeAvanzar(reserva)) return null;

  return {
    llamada: servicio.confirmar(reserva.id),
    aviso: `Confirmaste la reserva de ${reserva.vehiculo.patente}.`,
  };
}
