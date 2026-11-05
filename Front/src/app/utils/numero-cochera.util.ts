/**
 * Las cocheras se identifican con un numero: el propietario no tiene que
 * inventar un esquema de nomenclatura para cargar la primera.
 *
 * El backend guarda `identificador` como texto (hay datos viejos con formatos
 * como `A-01`), asi que el numero se lee y se escribe a traves de estos dos
 * helpers.
 */

/** El numero de una cochera ya cargada, o `null` si su identificador es viejo. */
export function numeroDeCochera(identificador: string): number | null {
  return /^\d{1,4}$/.test(identificador.trim()) ? Number(identificador.trim()) : null;
}
