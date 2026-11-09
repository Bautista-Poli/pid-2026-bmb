const PESOS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** "$ 1.250,5". */
export const pesos = (monto: number) => `$ ${PESOS.format(monto)}`;
