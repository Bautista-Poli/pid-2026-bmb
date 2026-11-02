import { AutorCalificacion, Reputacion, Reserva } from '@app/models';

/** `4.6★ (37)`; sin calificaciones, `sinDatos` ("Nuevo" para estacionamientos, "Sin calificaciones" para conductores). */
export function textoReputacion(reputacion: Reputacion, sinDatos: 'Nuevo' | 'Sin calificaciones'): string {
  if (reputacion.promedio === null || reputacion.cantidad === 0) return sinDatos;
  return `${reputacion.promedio.toFixed(1)}★ (${reputacion.cantidad})`;
}

/** Estados que califica cada lado: un Ausente solo lo califica el propietario. */
const CALIFICABLES: Record<AutorCalificacion, Reserva['estado'][]> = {
  CONDUCTOR: ['FINALIZADA'],
  PROPIETARIO: ['FINALIZADA', 'NO_SHOW'],
};

/** Si `lado` todavia puede calificar la reserva: terminada, sin calificar por ese lado y dentro del plazo. */
export function puedeCalificar(reserva: Reserva, lado: AutorCalificacion, ahora = new Date()): boolean {
  const { conductorCalifico, propietarioCalifico, calificableHasta } = reserva.calificacion;
  const yaCalifico = lado === 'CONDUCTOR' ? conductorCalifico : propietarioCalifico;
  return (
    CALIFICABLES[lado].includes(reserva.estado) &&
    !yaCalifico &&
    calificableHasta !== null &&
    Date.parse(calificableHasta) > ahora.getTime()
  );
}
