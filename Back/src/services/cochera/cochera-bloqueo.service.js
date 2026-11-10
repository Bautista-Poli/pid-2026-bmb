// Bloqueo de una cochera por mantenimiento (con reasignacion de sus reservas),
// desbloqueo a mano y el desbloqueo automatico de los vencidos.
import { query, withTransaction } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { ESTADOS_RESERVA, ESTADOS_VIGENTES } from '../../utils/roles.js';
import { finEfectivo } from '../../utils/solapamiento.js';
import { asegurarPropiedad } from '../estacionamiento/estacionamiento.service.js';
import { buscarCocheraLibre } from './cochera-libre.js';
import { CAMPOS } from './cochera.service.js';

export const AVISO_REASIGNADA =
  'Te reasignamos a otra cochera del mismo estacionamiento: la tuya entro en mantenimiento.';
export const AVISO_CANCELADA_SIN_ALTERNATIVA =
  'Cancelamos tu reserva: la cochera entro en mantenimiento y no habia otra disponible en tu horario.';

/**
 * Bloquea una cochera por mantenimiento o uso interno. Cada reserva propia
 * PENDIENTE/CONFIRMADA vigente se reasigna a otra cochera compatible del
 * mismo estacionamiento (mismo tipo de vehiculo, misma franja horaria): el
 * precio no se toca, ya quedo fijo en la reserva al crearla.
 *
 * Todo o nada: si alguna reserva no tiene alternativa, no se bloquea nada
 * (409, listando cuales) salvo que venga `forzar: true` -- ahi esas puntuales
 * se cancelan en vez de trabar el bloqueo. Una reserva ACTIVA (el auto ya
 * adentro) siempre impide bloquear, con o sin `forzar`.
 */
export async function bloquear(idEstacionamiento, idPropietario, idCochera, { motivo, hasta, forzar = false } = {}) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  return withTransaction(async (client) => {
    const { rows: existentes } = await client.query(
      'SELECT activo, bloqueada FROM cochera WHERE id_cochera = $1 AND id_estacionamiento = $2 FOR UPDATE',
      [idCochera, idEstacionamiento],
    );
    if (!existentes[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
    if (!existentes[0].activo) throw ApiError.conflict('La cochera esta dada de baja');
    if (existentes[0].bloqueada) throw ApiError.conflict('La cochera ya esta bloqueada');

    const { rows: afectadas } = await client.query(
      `SELECT r.id_reserva, r.estado, r.inicio, r.fin, v.id_tipo_vehiculo
         FROM reserva r
         JOIN vehiculo v ON v.id_vehiculo = r.id_vehiculo
        WHERE r.id_cochera = $1 AND r.estado = ANY($2::estado_reserva[]) AND ${finEfectivo('r')} > now()
          -- Con hasta, lo que empieza despues del bloqueo no se toca.
          AND ($3::timestamptz IS NULL OR r.inicio < $3)
        FOR UPDATE OF r`,
      [idCochera, ESTADOS_VIGENTES, hasta ?? null],
    );

    if (afectadas.some((r) => r.estado === ESTADOS_RESERVA.ACTIVA)) {
      throw ApiError.conflict('No se puede bloquear: hay un vehiculo adentro en este momento');
    }

    const reasignadas = [];
    const sinAlternativa = [];
    for (const reserva of afectadas) {
      const { libre } = await buscarCocheraLibre(client, {
        idEstacionamiento,
        idTipoVehiculo: reserva.id_tipo_vehiculo,
        inicio: reserva.inicio,
        fin: reserva.fin,
        excluir: idCochera,
      });
      if (libre) reasignadas.push({ reserva, idCocheraNueva: libre.id_cochera });
      else sinAlternativa.push(reserva);
    }

    if (sinAlternativa.length > 0 && !forzar) {
      const franjas = sinAlternativa
        .map((r) => `${r.inicio.toLocaleString('es-AR')} a ${r.fin.toLocaleString('es-AR')}`)
        .join('; ');
      throw ApiError.conflict(
        `${sinAlternativa.length} reserva(s) no tienen otra cochera para reasignar en su horario (${franjas}). ` +
          'Volve a intentar cancelandolas, o confirma el bloqueo igual para cancelarlas.',
        { reservas_sin_alternativa: sinAlternativa.map((r) => r.id_reserva) },
      );
    }

    for (const { reserva, idCocheraNueva } of reasignadas) {
      await client.query(
        'UPDATE reserva SET id_cochera = $1, motivo_reasignacion = $2 WHERE id_reserva = $3',
        [idCocheraNueva, AVISO_REASIGNADA, reserva.id_reserva],
      );
    }
    for (const reserva of sinAlternativa) {
      await client.query(
        "UPDATE reserva SET estado = 'CANCELADA', cancelada_por = 'PROPIETARIO', motivo_reasignacion = $1 WHERE id_reserva = $2",
        [AVISO_CANCELADA_SIN_ALTERNATIVA, reserva.id_reserva],
      );
    }

    const { rows } = await client.query(
      `UPDATE cochera SET bloqueada = TRUE, motivo_bloqueo = $1, bloqueada_hasta = $2
        WHERE id_cochera = $3
        RETURNING ${CAMPOS}`,
      [motivo ?? null, hasta ?? null, idCochera],
    );

    return { cochera: rows[0], reasignadas: reasignadas.length, canceladas: sinAlternativa.length };
  });
}

/** Saca el bloqueo a mano. */
export async function desbloquear(idEstacionamiento, idPropietario, idCochera) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    `UPDATE cochera SET bloqueada = FALSE, motivo_bloqueo = NULL, bloqueada_hasta = NULL
      WHERE id_cochera = $1 AND id_estacionamiento = $2
      RETURNING ${CAMPOS}`,
    [idCochera, idEstacionamiento],
  );
  if (!rows[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
  return rows[0];
}

/** Cocheras con `bloqueada_hasta` ya vencido: las llama la revision de vencimientos (src/jobs/vencimientos.job.js). */
export async function desbloquearVencidas() {
  const { rows } = await query(
    `UPDATE cochera SET bloqueada = FALSE, motivo_bloqueo = NULL, bloqueada_hasta = NULL
      WHERE bloqueada AND bloqueada_hasta IS NOT NULL AND bloqueada_hasta <= now()
      RETURNING id_cochera`,
  );
  return rows.length;
}
