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
  /** Puntaje de 0 a 100 (calificaciones + operacion): ordena "Mejor calificados". */
  puntaje: number;
}

export const REPUTACION_VACIA: ResumenReputacion = {
  cantidad: 0,
  promedio: null,
  categorias: null,
  destacado: false,
  insignias: [],
  puntaje: 0,
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

export interface ResenaRecibida {
  id: Id;
  puntaje: number;
  etiquetas: EtiquetaConductor[];
  comentario: string | null;
  creadaEn: FechaHoraISO;
  /** El estacionamiento que lo califico. */
  estacionamiento: string;
  denunciaEstado: EstadoDenunciaResena | null;
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
  /** null si nadie la denuncio. Las ocultas no llegan. */
  denunciaEstado: EstadoDenunciaResena | null;
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

/* ---------------------------- denuncia de reseñas --------------------------- */

export type MotivoDenunciaResena = 'OFENSIVA' | 'FALSA' | 'DATOS_PERSONALES' | 'OTRO';

export const TEXTO_MOTIVO_DENUNCIA: Record<MotivoDenunciaResena, string> = {
  OFENSIVA: 'Ofensiva',
  FALSA: 'Falsa o no corresponde',
  DATOS_PERSONALES: 'Datos personales',
  OTRO: 'Otro',
};

export type EstadoDenunciaResena = 'PENDIENTE' | 'DESESTIMADA' | 'OCULTA';

/** Lo que ve el denunciante de su denuncia (una oculta ya no se lista). */
export const TEXTO_ESTADO_DENUNCIA: Record<EstadoDenunciaResena, string> = {
  PENDIENTE: 'Denunciada',
  DESESTIMADA: 'Denuncia desestimada',
  OCULTA: 'Oculta por moderación',
};

/** Una reseña denunciada, como la ve el administrador. */
export interface ResenaDenunciada {
  id: Id;
  autor: 'CONDUCTOR' | 'PROPIETARIO';
  /** Del conductor: el promedio de las categorias; del propietario: su puntaje. */
  nota: number;
  etiquetas: string[];
  comentario: string | null;
  creadaEn: FechaHoraISO;
  estacionamiento: { id: Id; nombre: string };
  conductor: { id: Id; nombre: string };
  motivo: MotivoDenunciaResena;
  detalle: string | null;
  denunciadaEn: FechaHoraISO;
  estado: EstadoDenunciaResena;
  moderadaEn: FechaHoraISO | null;
}
