import { Cochera } from '@app/models';

/** Las cocheras sin `sector` se agrupan en esta planta. */
export const SIN_PLANTA = 'Sin planta';

/** Las cocheras de una planta (la columna `sector`). */
export interface Planta {
  nombre: string;
  cocheras: Cochera[];
}

/**
 * Lo que la ficha y la edicion masiva le avisan a la pantalla cuando ya
 * hicieron su pedido: hay que recargar las cocheras.
 */
export interface CambioCocheras {
  /** Mensaje para mostrar arriba del plano. Sin aviso: solo recargar (el pedido fallo). */
  aviso?: string;
  /** Planta a la que se movieron las cocheras: el plano pasa a mostrarla. */
  planta?: string;
}

/** Cocheras agrupadas por planta, en el orden en que aparecen. */
export function agruparPorPlanta(cocheras: Cochera[]): Planta[] {
  const porPlanta = new Map<string, Cochera[]>();
  for (const cochera of cocheras) {
    const nombre = cochera.sector?.trim() || SIN_PLANTA;
    porPlanta.set(nombre, [...(porPlanta.get(nombre) ?? []), cochera]);
  }
  return [...porPlanta].map(([nombre, lista]) => ({ nombre, cocheras: lista }));
}

/** Nombres de las plantas cargadas (sin la de "Sin planta"), para sugerirlas al escribir. */
export function nombresDePlantas(plantas: Planta[]): string[] {
  return plantas.map((p) => p.nombre).filter((nombre) => nombre !== SIN_PLANTA);
}

/** Prefijo que ya usa una planta ("PB" de "PB-7"), o null si ninguna cochera lo tiene. */
export function prefijoDePlanta(planta: Planta | undefined): string | null {
  const cochera = planta?.cocheras.find((c) => /^.+-\d+$/.test(c.identificador));
  return cochera?.identificador.replace(/-\d+$/, '') ?? null;
}

/** Ultimo numero usado con ese prefijo entre todas las cocheras ("PB-7" -> 7); 0 si no hay. */
export function ultimoNumero(plantas: Planta[], prefijo: string): number {
  const patron = new RegExp(`^${prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
  const numeros = plantas
    .flatMap((p) => p.cocheras)
    .map((c) => Number(patron.exec(c.identificador)?.[1] ?? 0));
  return Math.max(0, ...numeros);
}
