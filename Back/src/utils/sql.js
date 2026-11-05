// Helpers para armar SQL dinamico.

/**
 * Asignaciones `campo = $n` de un UPDATE para los `campos` que vinieron en
 * `datos` (los `undefined` se saltean; un `null` si se guarda). Empuja los
 * valores al final de `parametros`, asi la numeracion sigue la que ya hay.
 */
export function armarSet(campos, datos, parametros) {
  const asignaciones = [];
  for (const campo of campos) {
    if (datos[campo] === undefined) continue;
    parametros.push(datos[campo]);
    asignaciones.push(`${campo} = $${parametros.length}`);
  }
  return asignaciones;
}
