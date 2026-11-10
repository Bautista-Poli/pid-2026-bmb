import { Id } from './api.model';

/**
 * Calificaciones de una reserva: la que hace el conductor del estacionamiento
 * (por categoria, despues de entrar y salir) y la que hace el propietario del
 * conductor. Con ellas el backend arma la reputacion (reputacion.model.ts).
 */
export type CategoriaCalificacion = 'limpieza' | 'infraestructura' | 'atencion' | 'seguridad' | 'acceso';

interface InfoCategoria {
  codigo: CategoriaCalificacion;
  nombre: string;
  ayuda: string;
}

/** En el orden en que se califican y se muestran. */
export const CATEGORIAS_CALIFICACION: readonly InfoCategoria[] = [
  { codigo: 'limpieza', nombre: 'Limpieza', ayuda: 'Cocheras, accesos y baños' },
  { codigo: 'infraestructura', nombre: 'Infraestructura', ayuda: 'Iluminación, techado, rampas' },
  { codigo: 'atencion', nombre: 'Atención', ayuda: 'Trato y respuesta del personal' },
  { codigo: 'seguridad', nombre: 'Seguridad', ayuda: 'Te sentiste tranquilo dejando el auto' },
  { codigo: 'acceso', nombre: 'Acceso y señalización', ayuda: 'Fácil de encontrar y de entrar' },
];

export type EtiquetaCalificacion =
  | 'MUY_LIMPIO'
  | 'BIEN_ILUMINADO'
  | 'BUENA_ATENCION'
  | 'SEGURO'
  | 'FACIL_DE_LLEGAR'
  | 'POCA_LIMPIEZA'
  | 'POCA_ILUMINACION'
  | 'DIFICIL_DE_MANIOBRAR';

export const TEXTO_ETIQUETA: Record<EtiquetaCalificacion, string> = {
  MUY_LIMPIO: 'Muy limpio',
  BIEN_ILUMINADO: 'Bien iluminado',
  BUENA_ATENCION: 'Buena atención',
  SEGURO: 'Seguro',
  FACIL_DE_LLEGAR: 'Fácil de llegar',
  POCA_LIMPIEZA: 'Le faltaba limpieza',
  POCA_ILUMINACION: 'Poca iluminación',
  DIFICIL_DE_MANIOBRAR: 'Difícil de maniobrar',
};

/** Las que se ofrecen al calificar, positivas primero. */
export const ETIQUETAS_CALIFICACION = Object.keys(TEXTO_ETIQUETA) as EtiquetaCalificacion[];

/** Payload de `POST /api/reservas/:id/calificacion`. */
export interface NuevaCalificacion {
  notas: Record<CategoriaCalificacion, number>;
  etiquetas: EtiquetaCalificacion[];
  comentario: string;
}

export interface Calificacion {
  id: Id;
  reservaId: Id;
  promedio: number;
}

/* ------------------------ calificacion del conductor ----------------------- */

/** Lo que marca el propietario al calificar al conductor de una reserva. */
export type EtiquetaConductor =
  | 'PUNTUAL'
  | 'RESPETUOSO'
  | 'CUIDO_LA_COCHERA'
  | 'LLEGO_TARDE'
  | 'SE_EXCEDIO'
  | 'NO_AVISO_AUSENCIA';

export const TEXTO_ETIQUETA_CONDUCTOR: Record<EtiquetaConductor, string> = {
  PUNTUAL: 'Puntual',
  RESPETUOSO: 'Respetuoso',
  CUIDO_LA_COCHERA: 'Cuidó la cochera',
  LLEGO_TARDE: 'Llegó tarde',
  SE_EXCEDIO: 'Se excedió',
  NO_AVISO_AUSENCIA: 'No avisó que no venía',
};

export const ETIQUETAS_CONDUCTOR_POSITIVAS: readonly EtiquetaConductor[] = ['PUNTUAL', 'RESPETUOSO', 'CUIDO_LA_COCHERA'];
export const ETIQUETAS_CONDUCTOR_NEGATIVAS: readonly EtiquetaConductor[] = ['LLEGO_TARDE', 'SE_EXCEDIO', 'NO_AVISO_AUSENCIA'];

/** Payload de `POST /api/reservas/:id/calificacion-conductor`. */
export interface NuevaCalificacionConductor {
  puntaje: number;
  etiquetas: EtiquetaConductor[];
  comentario: string;
}
