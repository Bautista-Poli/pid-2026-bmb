import { CodigoNivel, FechaISO, HoraHHmm, OrdenEstacionamiento } from '@app/models';

/**
 * Lo que se edita en el panel de filtros del mapa (fecha, horario, precio, orden,
 * techo y nivel). Se aplica recien con "Aplicar". Lo usa la pantalla `mapa.ts`.
 */
export interface Panel {
  fecha: FechaISO;
  /** Vacios: "ahora". */
  desde: HoraHHmm;
  /** Cuantas horas se quiere reservar desde `desde`. */
  horas: number;
  precioMinimo: number;
  precioMaximo: number;
  orden: OrdenEstacionamiento;
  soloCubiertos: boolean;
  /** "Oro o mas", "solo Diamante"...; null: todos. */
  nivelMinimo: CodigoNivel | null;
}

/**
 * "HH:mm" de fin sumando `horas` al inicio. `null` si pasa de la medianoche:
 * la reserva tiene que empezar y terminar el mismo dia.
 */
export function horaFin(desde: HoraHHmm, horas: number): HoraHHmm | null {
  const [h, m] = desde.split(':').map(Number);
  const minutos = h * 60 + m + horas * 60;
  if (minutos > 24 * 60 - 1) return null;
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/** "$1.500". */
export function pesos(monto: number): string {
  return `$${monto.toLocaleString('es-AR')}`;
}
