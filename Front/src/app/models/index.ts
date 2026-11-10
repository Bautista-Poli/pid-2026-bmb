// Punto unico de import de los modelos: `import { … } from '@app/models'`.

// Tipos base y contrato de errores de la API.
export * from './api.model';

// Usuarios y lo que registran.
export * from './usuario.model';
export * from './vehiculo.model';
export * from './estacionamiento.model';
export * from './cochera.model';
export * from './tarifa.model';

// Operacion: reservas, abonos y reclamos.
export * from './reserva.model';
export * from './abono.model';
export * from './incidencia.model';

// Calificaciones, reputacion y moderacion de reseñas.
export * from './calificacion.model';
export * from './reputacion.model';
export * from './denuncia-resena.model';

// Tableros del propietario y del administrador.
export * from './estadistica.model';
