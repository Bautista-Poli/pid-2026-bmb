import { FechaHoraISO, Id } from './api.model';

/**
 * Calificaciones y reputacion (gamificacion "Anfitrion destacado").
 * El conductor califica una reserva despues de entrar y salir; el puntaje y las
 * insignias del estacionamiento los calcula el backend.
 */
export type CategoriaCalificacion = 'limpieza' | 'infraestructura' | 'atencion' | 'seguridad' | 'acceso';

export interface InfoCategoria {
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

export type CodigoInsignia =
  | 'DESTACADO'
  | 'IMPECABLE'
  | 'BUENA_INFRAESTRUCTURA'
  | 'BUENA_ATENCION'
  | 'SEGURO'
  | 'FACIL_ACCESO';

export const TEXTO_INSIGNIA: Record<CodigoInsignia, string> = {
  DESTACADO: 'Anfitrión destacado',
  IMPECABLE: 'Impecable',
  BUENA_INFRAESTRUCTURA: 'Buena infraestructura',
  BUENA_ATENCION: 'Buena atención',
  SEGURO: 'Seguro',
  FACIL_ACCESO: 'Fácil acceso',
};

/** Promedios de 1 a 5 por categoria (null si nadie califico esa ventana). */
export type PromediosCategoria = Record<CategoriaCalificacion, number | null>;

/** Lo publico de la reputacion: viene con cada estacionamiento (ultimos 90 dias). */
export interface ResumenReputacion {
  cantidad: number;
  /** Promedio general de 1 a 5, o null sin calificaciones. */
  promedio: number | null;
  categorias: PromediosCategoria | null;
  destacado: boolean;
  insignias: CodigoInsignia[];
}

export const REPUTACION_VACIA: ResumenReputacion = {
  cantidad: 0,
  promedio: null,
  categorias: null,
  destacado: false,
  insignias: [],
};

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

/* ------------------------ reputacion del propietario ----------------------- */

export type PeriodoReputacion = 30 | 90;

export interface CategoriaReputacion {
  codigo: CategoriaCalificacion;
  nombre: string;
  promedio: number | null;
  /** El del periodo anterior de la misma duracion, para la tendencia. */
  anterior: number | null;
}

export interface IndicadorOperacion {
  /** De 0 a 10. */
  puntos: number;
}

export interface Opinion {
  id: Id;
  autor: string;
  creadaEn: FechaHoraISO;
  promedio: number;
  comentario: string | null;
  etiquetas: EtiquetaCalificacion[];
}

export interface SugerenciaReputacion {
  categoria: CategoriaCalificacion;
  nombre: string;
  promedio: number;
  objetivo: number;
  /** Puntos que sumaria llevar la categoria al objetivo. */
  puntos: number;
  etiqueta: { codigo: EtiquetaCalificacion; cantidad: number } | null;
}

/** `GET /api/estacionamientos/:id/reputacion?dias=30|90` */
export interface ReputacionEstacionamiento {
  dias: PeriodoReputacion;
  puntaje: number;
  puntajeAnterior: number | null;
  destacado: boolean;
  umbralDestacado: number;
  minimoCalificaciones: number;
  calificaciones: {
    cantidad: number;
    promedio: number | null;
    /** De 0 a 60. */
    puntos: number;
    categorias: CategoriaReputacion[];
  };
  operacion: {
    /** De 0 a 40. */
    puntos: number;
    confirmacion: IndicadorOperacion & { porcentaje: number; vencidas: number; reservas: number };
    incidencias: IndicadorOperacion & { sinDenuncia: number; total: number };
    respuesta: IndicadorOperacion & { minutos: number | null };
    cancelaciones: IndicadorOperacion & { propias: number };
  };
  insignias: CodigoInsignia[];
  etiquetas: { codigo: EtiquetaCalificacion; positiva: boolean; cantidad: number }[];
  sugerencia: SugerenciaReputacion | null;
  opiniones: Opinion[];
}

/** "4,7" */
export function formatearNota(nota: number | null | undefined): string {
  return nota == null ? '–' : nota.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
