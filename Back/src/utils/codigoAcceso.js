// Codigo de acceso de la reserva: el que va en su QR y que el operador
// escanea (o tipea) al entrar y al salir. Lo genera la base
// (generar_codigo_acceso() en schema.sql); aca solo se valida lo que llega.

/** Sin 0 O 1 I L, que se confunden al leerlos o dictarlos. Tiene que coincidir con schema.sql. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LARGO_CODIGO = 8;

const REGEX_CODIGO = new RegExp(`^[${ALFABETO_CODIGO}]{${LARGO_CODIGO}}$`);

/** Saca guiones y espacios y pasa a mayusculas. `null` si no tiene forma de codigo. */
export function normalizarCodigo(bruto) {
  if (typeof bruto !== 'string') return null;
  const limpio = bruto.replace(/[\s-]/g, '').toUpperCase();
  return REGEX_CODIGO.test(limpio) ? limpio : null;
}
