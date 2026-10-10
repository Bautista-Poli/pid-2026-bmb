export const ROLES = Object.freeze({
  CONDUCTOR: 'CONDUCTOR',
  PROPIETARIO: 'PROPIETARIO',
  // Usuario aparte: no se registra ni se combina con los otros perfiles.
  ADMINISTRADOR: 'ADMINISTRADOR',
});

// Revision del estacionamiento por el administrador antes de verse en la busqueda.
export const ESTADOS_APROBACION = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
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
