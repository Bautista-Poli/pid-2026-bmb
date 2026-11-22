/** Formas de cobrar una reserva. */
export type ModalidadReserva = 'HORA' | 'ESTADIA' | 'JORNADA';

/** Duracion fija de las modalidades por bloque (espejo de Back/src/utils/tarifas.js). */
export const HORAS_POR_MODALIDAD = { ESTADIA: 12, JORNADA: 24 } as const;

/** Cuanto se reserva: las horas y la modalidad con la que se cobran (ver `duracionReservable`). */
export interface Duracion {
  horas: number;
  modalidad: ModalidadReserva;
}

export const ETIQUETA_MODALIDAD: Record<ModalidadReserva, string> = {
  HORA: 'Por hora',
  ESTADIA: `Estadía · ${HORAS_POR_MODALIDAD.ESTADIA} h`,
  JORNADA: `Jornada · ${HORAS_POR_MODALIDAD.JORNADA} h`,
};

/** Precio de cada modalidad; `null` = el estacionamiento no la ofrece (0 es gratis). */
export interface Tarifas {
  hora: number | null;
  estadia: number | null;
  jornada: number | null;
}
