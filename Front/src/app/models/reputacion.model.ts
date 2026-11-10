import { FechaHoraISO, Id } from './api.model';
import { CategoriaCalificacion, EtiquetaCalificacion, EtiquetaConductor } from './calificacion.model';
import { EstadoDenunciaResena } from './denuncia-resena.model';

/**
 * Reputacion (gamificacion "Anfitrion destacado"): puntaje, niveles e insignias
 * del estacionamiento, y lo que le pusieron los propietarios al conductor. La
 * calcula el backend a partir de las calificaciones.
 */
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

/** Niveles segun el puntaje, de menor a mayor (los define el backend). */
export type CodigoNivel = 'COBRE' | 'PLATA' | 'ORO' | 'PLATINO' | 'ESMERALDA' | 'DIAMANTE';

export const NOMBRE_NIVEL: Record<CodigoNivel, string> = {
  COBRE: 'Cobre',
  PLATA: 'Plata',
  ORO: 'Oro',
  PLATINO: 'Platino',
  ESMERALDA: 'Esmeralda',
  DIAMANTE: 'Diamante',
};

export interface Nivel {
  codigo: CodigoNivel;
  nombre: string;
  /** Puntaje desde el que se alcanza. */
  desde: number;
}

/** Promedios de 1 a 5 por categoria (null si nadie califico esa ventana). */
type PromediosCategoria = Record<CategoriaCalificacion, number | null>;

/** Lo publico de la reputacion: viene con cada estacionamiento (ultimos 90 dias). */
export interface ResumenReputacion {
  cantidad: number;
  /** Promedio general de 1 a 5, o null sin calificaciones. */
  promedio: number | null;
  categorias: PromediosCategoria | null;
  destacado: boolean;
  /** Null mientras no tenga el minimo de calificaciones. */
  nivel: CodigoNivel | null;
  insignias: CodigoInsignia[];
  /** Puntaje de 0 a 100 (calificaciones + operacion): ordena "Mejor calificados". */
  puntaje: number;
}

export const REPUTACION_VACIA: ResumenReputacion = {
  cantidad: 0,
  promedio: null,
  categorias: null,
  destacado: false,
  nivel: null,
  insignias: [],
  puntaje: 0,
};

/* ------------------------ reputacion del propietario ----------------------- */

export type PeriodoReputacion = 30 | 90;

export interface CategoriaReputacion {
  codigo: CategoriaCalificacion;
  nombre: string;
  promedio: number | null;
  /** El del periodo anterior de la misma duracion, para la tendencia. */
  anterior: number | null;
}

interface IndicadorOperacion {
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
  /** null si nadie la denuncio. Las ocultas no llegan. */
  denunciaEstado: EstadoDenunciaResena | null;
}

interface SugerenciaReputacion {
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
  nivel: CodigoNivel | null;
  /** El que sigue y cuantos puntos faltan; null si ya es Diamante. */
  siguienteNivel: { codigo: CodigoNivel; desde: number; faltan: number } | null;
  niveles: Nivel[];
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

/* ------------------------- reputacion del conductor ------------------------ */

/** Lo que le pusieron los propietarios al conductor, de toda su historia. */
export interface ReputacionConductor {
  /** De 1 a 5, o null sin calificaciones. */
  promedio: number | null;
  cantidad: number;
  /** Las mas marcadas, la mayor primero (hasta 3). */
  etiquetas: { codigo: EtiquetaConductor; cantidad: number }[];
  /** Las que ya puede ver: de reservas que califico o cuyo plazo vencio (hasta 20). */
  resenas: ResenaRecibida[];
}

interface ResenaRecibida {
  id: Id;
  puntaje: number;
  etiquetas: EtiquetaConductor[];
  comentario: string | null;
  creadaEn: FechaHoraISO;
  /** El estacionamiento que lo califico. */
  estacionamiento: string;
  denunciaEstado: EstadoDenunciaResena | null;
}
