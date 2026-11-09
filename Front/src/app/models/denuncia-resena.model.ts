import { FechaHoraISO, Id } from './api.model';

/** Denuncias de reseñas: las hace quien recibio la reseña y las modera el administrador. */
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
