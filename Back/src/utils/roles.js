export const ROLES = Object.freeze({
  CONDUCTOR: 'CONDUCTOR',
  PROPIETARIO: 'PROPIETARIO',
});

export const ESTADOS_RESERVA = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  CONFIRMADA: 'CONFIRMADA',
  ACTIVA: 'ACTIVA',
  CANCELADA: 'CANCELADA',
  FINALIZADA: 'FINALIZADA',
  // El vehiculo no llego dentro de la tolerancia: la cochera se libera.
  NO_SHOW: 'NO_SHOW',
});

// Quien cancelo una reserva (columna `cancelada_por`). SISTEMA: una PENDIENTE
// que el propietario no confirmo antes de su inicio.
export const ORIGENES_CANCELACION = Object.freeze({
  CONDUCTOR: 'CONDUCTOR',
  PROPIETARIO: 'PROPIETARIO',
  SISTEMA: 'SISTEMA',
});

// Estados que ocupan la cochera: son los que se controlan por solapamiento.
export const ESTADOS_VIGENTES = Object.freeze([
  ESTADOS_RESERVA.PENDIENTE,
  ESTADOS_RESERVA.CONFIRMADA,
  ESTADOS_RESERVA.ACTIVA,
]);

export const ESTADOS_COCHERA = Object.freeze({
  LIBRE: 'LIBRE',
  OCUPADA: 'OCUPADA',
  RESERVADA: 'RESERVADA',
  INACTIVA: 'INACTIVA',
});
