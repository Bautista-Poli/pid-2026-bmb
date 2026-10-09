// Abonos por turno. El abono no es una reserva anticipada: es un cupo de usos
// prepago. Con el, el conductor reserva gratis dentro de su turno y cada
// reserva descuenta un uso (ver validarAbonoParaReservar y reserva.service.js).
import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_UNIQUE = '23505';

const CAMPOS_PLAN = 'id_plan, id_estacionamiento, turno::text AS turno, cupos, precio, activo';

/* --------------------------------- planes --------------------------------- */

/** Planes que se pueden comprar hoy: los activos, en orden manana, tarde, noche. */
export async function listarPlanes(idEstacionamiento) {
  const { rows } = await query(
    `SELECT ${CAMPOS_PLAN} FROM plan_abono
      WHERE id_estacionamiento = $1 AND activo
      ORDER BY turno`,
    [idEstacionamiento],
  );
  return rows;
}

export async function crearPlan(idEstacionamiento, idPropietario, { turno, cupos, precio }) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  try {
    const { rows } = await query(
      `INSERT INTO plan_abono (id_estacionamiento, turno, cupos, precio)
       VALUES ($1, $2, $3, $4)
       RETURNING ${CAMPOS_PLAN}`,
      [idEstacionamiento, turno, cupos, precio],
    );
    return rows[0];
  } catch (error) {
    if (error.code === VIOLACION_UNIQUE) {
      throw ApiError.conflict(`Ya hay un plan activo para el turno ${turno.toLowerCase()}`);
    }
    throw error;
  }
}

/** Cambia usos y/o precio. Los abonos ya vendidos no cambian: copiaron el plan al comprar. */
export async function actualizarPlan(idEstacionamiento, idPropietario, idPlan, cambios) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const sets = [];
  const valores = [];
  for (const campo of ['cupos', 'precio']) {
    if (cambios[campo] === undefined) continue;
    valores.push(cambios[campo]);
    sets.push(`${campo} = $${valores.length}`);
  }
  if (sets.length === 0) throw ApiError.badRequest('Enviar cupos y/o precio');
  valores.push(idPlan, idEstacionamiento);

  const { rows } = await query(
    `UPDATE plan_abono SET ${sets.join(', ')}
      WHERE id_plan = $${valores.length - 1} AND id_estacionamiento = $${valores.length} AND activo
      RETURNING ${CAMPOS_PLAN}`,
    valores,
  );
  if (!rows[0]) throw ApiError.notFound('El plan no existe en este estacionamiento');
  return rows[0];
}

/** Baja logica: los abonos vendidos lo referencian. Libera el turno para un plan nuevo. */
export async function darDeBajaPlan(idEstacionamiento, idPropietario, idPlan) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rowCount } = await query(
    `UPDATE plan_abono SET activo = FALSE
      WHERE id_plan = $1 AND id_estacionamiento = $2 AND activo`,
    [idPlan, idEstacionamiento],
  );
  if (rowCount === 0) throw ApiError.notFound('El plan no existe en este estacionamiento');
}
