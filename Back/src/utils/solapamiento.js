/**
 * Condicion SQL "la cochera `c` no tiene reservas vigentes que se pisen con
 * [inicio, fin)". Recibe los placeholders de los parametros y, opcionalmente, la
 * expresion de la cochera (por defecto `c.id_cochera`).
 * Dos rangos [a, b) y [c, d) se solapan si  a < d  AND  b > c.
 */
export function sinSolapamiento(estados, inicio, fin, cochera = 'c.id_cochera') {
  return `NOT EXISTS (
    SELECT 1 FROM reserva r
     WHERE r.id_cochera = ${cochera}
       AND r.estado = ANY(${estados}::estado_reserva[])
       AND r.inicio < ${fin}
       AND r.fin > ${inicio}
  )`;
}
