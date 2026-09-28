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
