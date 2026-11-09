import { Cochera } from '@app/models';

/** Las cocheras sin `sector` se agrupan en esta planta. */
export const SIN_PLANTA = 'Sin planta';

/** Las cocheras de una planta (la columna `sector`). */
export interface Planta {
  nombre: string;
  cocheras: Cochera[];
}
