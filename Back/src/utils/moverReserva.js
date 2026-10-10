// Herramienta de prueba (npm run db:mover-reserva): interpreta la hora a la
// que se quiere mover una reserva. Argentina no tiene horario de verano, asi
// que la hora local es siempre UTC-3.

const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;

const REGEX_HORA = /^(\d{1,2}):(\d{2})$/;
const REGEX_FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/;

/** Fecha UTC que corresponde a esa fecha y hora en Argentina, o `null` si no existe. */
function desdeHoraArgentina(anio, mes, dia, hora, minuto) {
  if (hora > 23 || minuto > 59) return null;
  const utc = Date.UTC(anio, mes - 1, dia, hora, minuto) - OFFSET_ARGENTINA_MS;
  const local = new Date(utc + OFFSET_ARGENTINA_MS);
  if (local.getUTCMonth() !== mes - 1 || local.getUTCDate() !== dia) return null;
  return new Date(utc);
}

/**
 * Nuevo inicio de la reserva a partir de lo que se tipeo:
 * - `ahora`: este minuto.
 * - `HH:MM`: hoy a esa hora (Argentina).
 * - `AAAA-MM-DD HH:MM`: ese dia a esa hora (Argentina).
 * Devuelve `null` si no se entiende.
 */
export function parsearInicio(texto, ahora = new Date()) {
  if (typeof texto !== 'string') return null;
  const valor = texto.trim();

  if (valor.toLowerCase() === 'ahora') {
    return new Date(Math.floor(ahora.getTime() / MINUTO_MS) * MINUTO_MS);
  }

  const soloHora = REGEX_HORA.exec(valor);
  if (soloHora) {
    const hoy = new Date(ahora.getTime() + OFFSET_ARGENTINA_MS);
    return desdeHoraArgentina(
      hoy.getUTCFullYear(),
      hoy.getUTCMonth() + 1,
      hoy.getUTCDate(),
      Number(soloHora[1]),
      Number(soloHora[2]),
    );
  }

  const completa = REGEX_FECHA_HORA.exec(valor);
  if (completa) {
    const [, anio, mes, dia, hora, minuto] = completa.map(Number);
    return desdeHoraArgentina(anio, mes, dia, hora, minuto);
  }

  return null;
}

/** Fecha y hora en Argentina, para mostrar en la consola. */
export function formatearArgentina(fecha) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(fecha);
}
