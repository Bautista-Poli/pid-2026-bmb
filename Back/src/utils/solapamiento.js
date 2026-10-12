/**
 * Fin "efectivo" de una reserva para los chequeos de solapamiento. Una ACTIVA
 * cuyo `fin` ya paso es un auto que se excedio y sigue adentro: ocupa la
 * cochera hasta que se registre el egreso, asi que se toma como si no
 * terminara nunca. El resto termina en su `fin`.
 */
export function finEfectivo(alias = 'r') {
  return `CASE WHEN ${alias}.estado = 'ACTIVA' AND ${alias}.fin <= now()
               THEN 'infinity'::timestamptz ELSE ${alias}.fin END`;
}

/**
 * Condicion SQL "la cochera `c` no tiene reservas vigentes que se pisen con
 * [inicio, fin)". Recibe los placeholders de los parametros y, opcionalmente, la
 * expresion de la cochera (por defecto `c.id_cochera`).
 * Dos rangos [a, b) y [c, d) se solapan si  a < d  AND  b > c.
 * Un auto excedido (ver finEfectivo) bloquea la cochera hasta su egreso.
 */
export function sinSolapamiento(estados, inicio, fin, cochera = 'c.id_cochera') {
  return `NOT EXISTS (
    SELECT 1 FROM reserva r
     WHERE r.id_cochera = ${cochera}
       AND r.estado = ANY(${estados}::estado_reserva[])
       AND r.inicio < ${fin}
       AND ${finEfectivo('r')} > ${inicio}
  )`;
}
