// Modalidades de tarifa y su precio. Funciones puras: sin base ni red.

export const MODALIDADES = Object.freeze({
  HORA: 'HORA',
  ESTADIA: 'ESTADIA',
  JORNADA: 'JORNADA',
});

// Duracion fija (en horas) de las modalidades que se cobran por bloque.
// El front tiene el espejo en Front/src/app/models/tarifa.model.ts.
export const HORAS_POR_MODALIDAD = Object.freeze({ ESTADIA: 12, JORNADA: 24 });

/** Columnas de `estacionamiento` con el precio de cada modalidad (NULL = no la ofrece). */
export const CAMPOS_TARIFA = Object.freeze(['tarifa_hora', 'tarifa_estadia', 'tarifa_jornada']);

const COLUMNA_POR_MODALIDAD = Object.freeze({
  HORA: 'tarifa_hora',
  ESTADIA: 'tarifa_estadia',
  JORNADA: 'tarifa_jornada',
});

const MS_POR_HORA = 3_600_000;

/** Motivo por el que [inicio, fin) no dura lo que exige la modalidad, o null si esta bien. */
export function motivoDuracionInvalida(modalidad, inicio, fin) {
  const horas = HORAS_POR_MODALIDAD[modalidad];
  if (horas === undefined) return null;

  if (fin.getTime() - inicio.getTime() !== horas * MS_POR_HORA) {
    return `la modalidad ${modalidad} dura exactamente ${horas} horas`;
  }
  return null;
}

/**
 * Precio de la reserva segun la modalidad, o null si el estacionamiento no la
 * ofrece. Un 0 es un precio (gratis), no "no se ofrece".
 * Por hora es proporcional (redondeado a centavos); estadia y jornada son fijos.
 */
export function precioDeReserva(modalidad, tarifas, inicio, fin) {
  const tarifa = tarifas[COLUMNA_POR_MODALIDAD[modalidad]];
  if (tarifa === null || tarifa === undefined) return null;

  if (modalidad !== MODALIDADES.HORA) return Number(tarifa);

  const horas = (fin.getTime() - inicio.getTime()) / MS_POR_HORA;
  return Math.round(horas * Number(tarifa) * 100) / 100;
}
