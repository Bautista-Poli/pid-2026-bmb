// Espacio no separable: el "$" no queda solo en una linea en las tarjetas angostas.
const NBSP = String.fromCharCode(160);

/** "$ 12.500" (con espacio no separable). */
export const pesos = (monto: number) => `$${NBSP}${Math.round(monto).toLocaleString('es-AR')}`;

/** 0.42 -> "42 %". */
export const porciento = (fraccion: number) => `${Math.round(fraccion * 100)} %`;

/** "12/10" para el tooltip; debajo de la barra alcanza con el dia ("12"). */
export const diaYMes = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
export const diaDelMes = (fecha: string) => String(Number(fecha.slice(8, 10)));
