// Reglas de calendario del negocio.
// Argentina usa UTC-3 todo el anio (no tiene horario de verano), asi que las
// fechas y horas "locales" que manda el front se interpretan con ese offset fijo.

export const OFFSET_LOCAL = '-03:00';
const OFFSET_MS = -3 * 60 * 60 * 1000;

/** Franjas que ofrece la pantalla de reserva. */
export const FRANJAS_ESTANDAR = Object.freeze([
  { hora_desde: '08:00', hora_hasta: '10:00' },
  { hora_desde: '10:00', hora_hasta: '13:00' },
  { hora_desde: '13:00', hora_hasta: '17:00' },
  { hora_desde: '17:00', hora_hasta: '21:00' },
]);

/** `2026-09-10` + `14:00` -> instante de esa hora en Argentina. */
export function instanteLocal(fecha, hora) {
  return new Date(`${fecha}T${hora}:00${OFFSET_LOCAL}`);
}

/** Fecha, hora (HH:MM) y dia de la semana (0 = domingo) de un instante, en hora argentina. */
export function partesLocales(instante) {
  const desplazado = new Date(instante.getTime() + OFFSET_MS);
  const iso = desplazado.toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16), diaSemana: desplazado.getUTCDay() };
}

/** Suma dias a una fecha `YYYY-MM-DD`. */
export function sumarDias(fecha, dias) {
  const resultado = new Date(`${fecha}T00:00:00Z`);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado.toISOString().slice(0, 10);
}

/**
 * Motivo por el que [inicio, fin) queda fuera del horario de atencion, o null
 * si esta dentro. Un estacionamiento sin horarios cargados no se restringe.
 */
export function motivoFueraDeHorario(horarios, inicio, fin) {
  if (horarios.length === 0) return null;

  const desde = partesLocales(inicio);
  const hasta = partesLocales(fin);
  if (desde.fecha !== hasta.fecha) {
    return 'La reserva tiene que empezar y terminar el mismo dia';
  }

  const horario = horarios.find((h) => h.dia_semana === desde.diaSemana);
  if (!horario) return 'El estacionamiento no abre ese dia';

  const apertura = horario.hora_apertura.slice(0, 5);
  const cierre = horario.hora_cierre.slice(0, 5);
  if (desde.hora < apertura || hasta.hora > cierre) {
    return `La franja esta fuera del horario de atencion (${apertura} a ${cierre})`;
  }

  return null;
}

/**
 * Motivo por el que un ingreso en `inicio` cae fuera del horario de atencion, o
 * null si esta dentro. Lo usan las modalidades por bloque (estadia, jornada):
 * el bloque puede seguir despues del cierre, pero el vehiculo tiene que entrar
 * con el estacionamiento abierto. Sin horarios cargados no se restringe.
 */
export function motivoIngresoFueraDeHorario(horarios, inicio) {
  if (horarios.length === 0) return null;

  const { hora, diaSemana } = partesLocales(inicio);
  const horario = horarios.find((h) => h.dia_semana === diaSemana);
  if (!horario) return 'El estacionamiento no abre ese dia';

  const apertura = horario.hora_apertura.slice(0, 5);
  const cierre = horario.hora_cierre.slice(0, 5);
  if (hora < apertura || hora >= cierre) {
    return `El ingreso esta fuera del horario de atencion (${apertura} a ${cierre})`;
  }

  return null;
}
