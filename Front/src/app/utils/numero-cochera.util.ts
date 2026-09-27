import { Cochera } from '@app/models';

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

/**
 * El numero que se propone para la proxima cochera: el mayor cargado mas uno.
 *
 * Es el mayor y no el primer hueco libre porque el UNIQUE del backend cuenta
 * tambien las cocheras dadas de baja, asi que reutilizar un numero liberado
 * chocaria contra el constraint.
 */
export function siguienteNumero(cocheras: Cochera[]): number {
  const numeros = cocheras
    .map((cochera) => numeroDeCochera(cochera.identificador))
    .filter((numero): numero is number => numero !== null);

  return numeros.length === 0 ? 1 : Math.max(...numeros) + 1;
}
