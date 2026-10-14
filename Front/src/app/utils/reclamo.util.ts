import { Abono, EstadoReserva, ReservaDetallada } from '@app/models';
import { aInstante } from './fecha.util';

/** Igual que el back (DIAS_PARA_RECLAMAR): pasado este plazo desde el fin ya no se reclama. */
export const DIAS_PARA_RECLAMAR = 15;
const DIA_MS = 86_400_000;

/** Las que tuvieron (o tienen) un pago en juego. Una pendiente todavia no se confirmo. */
const RECLAMABLES: EstadoReserva[] = ['CONFIRMADA', 'ACTIVA', 'FINALIZADA', 'CANCELADA'];

/** Si todavia se puede reclamar algo que termina (o termino) en `fin`. */
export function puedeReclamar(fin: string | Date, ahora = new Date()): boolean {
  return ahora.getTime() - new Date(fin).getTime() <= DIAS_PARA_RECLAMAR * DIA_MS;
}

/** Una reserva pagada aparte (las de abono se reclaman sobre el abono), en plazo y sin reclamo abierto. */
export function reservaReclamable(reserva: ReservaDetallada, ahora = new Date()): boolean {
  return (
    !reserva.abono &&
    !reserva.reclamoAbierto &&
    RECLAMABLES.includes(reserva.estado) &&
    puedeReclamar(aInstante(reserva.fechaHasta, reserva.horaHasta), ahora)
  );
}

/** Un abono en plazo (hasta 15 dias despues de su ultimo dia) y sin reclamo abierto. */
export function abonoReclamable(abono: Abono, ahora = new Date()): boolean {
  return !abono.reclamoAbierto && puedeReclamar(`${abono.hasta}T23:59:59-03:00`, ahora);
}
