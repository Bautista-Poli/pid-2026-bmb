const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** "hace 3 días", "hace 5 h", "hace 20 min" o "recién": cuanto lleva esperando algo. */
export function haceCuanto(instante: string, ahora = new Date()): string {
  const ms = ahora.getTime() - new Date(instante).getTime();
  if (ms >= DIA) {
    const dias = Math.floor(ms / DIA);
    return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }
  if (ms >= HORA) return `hace ${Math.floor(ms / HORA)} h`;
  if (ms >= MINUTO) return `hace ${Math.floor(ms / MINUTO)} min`;
  return 'recién';
}
