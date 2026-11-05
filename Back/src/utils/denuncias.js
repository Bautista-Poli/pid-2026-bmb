// Denuncia de reseñas: valores de los enums de schema.sql.

export const MOTIVOS_DENUNCIA = Object.freeze(['OFENSIVA', 'FALSA', 'DATOS_PERSONALES', 'OTRO']);

export const ESTADOS_DENUNCIA = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  DESESTIMADA: 'DESESTIMADA',
  OCULTA: 'OCULTA',
});

/** Tope de los listados de la cola del administrador. */
export const LIMITE_DENUNCIAS = 100;
