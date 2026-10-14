/**
 * Codigo de acceso de una reserva (el de su QR). Mismo alfabeto y largo que
 * el backend: sin 0 O 1 I L.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO = 8;
const REGEX_CODIGO = new RegExp(`^[${ALFABETO}]{${LARGO}}$`);

/** Saca guiones y espacios y pasa a mayusculas. `null` si no tiene forma de codigo. */
export function normalizarCodigo(bruto: string): string | null {
  const limpio = bruto.replace(/[\s-]/g, '').toUpperCase();
  return REGEX_CODIGO.test(limpio) ? limpio : null;
}

/** `K7MQ2XTR` -> `K7MQ-2XTR`. */
export function formatearCodigo(codigo: string): string {
  return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
}

/** URL que codifica el QR: la camara del operador abre la app directo en la confirmacion. */
export function urlDeAcceso(codigo: string, origen: string = globalThis.location.origin): string {
  return `${origen}/propietario/acceso/${codigo}`;
}
