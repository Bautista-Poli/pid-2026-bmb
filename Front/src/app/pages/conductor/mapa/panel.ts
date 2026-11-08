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
