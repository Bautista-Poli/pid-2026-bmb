// Abonos por turno. El abono no es una reserva anticipada: es un cupo de usos
// prepago. Con el, el conductor reserva gratis dentro de su turno y cada
// reserva descuenta un uso (ver validarAbonoParaReservar y reserva.service.js).
import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { partesLocales } from '../utils/horario.js';
import { motivoFueraDeTurno, TURNOS } from '../utils/turnos.js';
import { aceptaReservas, asegurarPropiedad } from './estacionamiento.service.js';

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

/** Sin horarios cargados no se restringe (igual que al reservar). */
async function asegurarQueAbreEnElTurno(idEstacionamiento, turno) {
  const { rows } = await query(
    `SELECT to_char(hora_apertura, 'HH24:MI') AS apertura, to_char(hora_cierre, 'HH24:MI') AS cierre
       FROM horario WHERE id_estacionamiento = $1`,
    [idEstacionamiento],
  );
  const t = TURNOS[turno];
  if (rows.length > 0 && !rows.some((h) => h.apertura < t.hasta && h.cierre > t.desde)) {
    throw ApiError.conflict(`El estacionamiento no abre en el turno ${t.etiqueta} (${t.desde} a ${t.hasta})`);
  }
}

export async function crearPlan(idEstacionamiento, idPropietario, { turno, cupos, precio }) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);
  await asegurarQueAbreEnElTurno(idEstacionamiento, turno);

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

/* --------------------------------- abonos --------------------------------- */

/** Vigencia en dias corridos desde la compra (supuesto de la spec, pregunta 3). */
export const DIAS_VIGENCIA = 30;

const ESTADOS_ABONO = Object.freeze({ VIGENTE: 'VIGENTE', CANCELADO: 'CANCELADO', VENCIDO: 'VENCIDO' });

/** "Hoy" del negocio: la fecha en Argentina, no la del servidor. */
const HOY_LOCAL = `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;

/**
 * `desde`/`hasta` van como texto: pg convierte un DATE en un Date de JS a la
 * medianoche del servidor y la fecha se puede correr un dia. Los usos
 * consumidos se cuentan de las reservas, no se guardan.
 */
const SELECT_ABONO = `
  SELECT a.id_abono, a.id_conductor, u.nombre AS conductor_nombre, u.apellido AS conductor_apellido,
         a.id_estacionamiento, e.nombre AS estacionamiento, a.id_plan,
         a.turno::text AS turno, a.cupos_totales, a.precio_total,
         a.desde::text AS desde, a.hasta::text AS hasta, a.estado::text AS estado, a.created_at,
         (SELECT COUNT(*)::int FROM reserva r
           WHERE r.id_abono = a.id_abono AND r.estado <> 'CANCELADA') AS cupos_usados
    FROM abono a
    JOIN estacionamiento e ON e.id_estacionamiento = a.id_estacionamiento
    JOIN usuario u         ON u.id_usuario = a.id_conductor
`;

const conRestantes = (abono) => ({ ...abono, cupos_restantes: abono.cupos_totales - abono.cupos_usados });

async function obtenerAbono(ejecutor, idAbono) {
  const { rows } = await ejecutor.query(`${SELECT_ABONO} WHERE a.id_abono = $1`, [idAbono]);
  return conRestantes(rows[0]);
}

/** El pago es simulado: comprar es crear el abono con los datos del plan copiados. */
export async function comprar(idConductor, { id_plan }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT p.id_plan, p.id_estacionamiento, p.turno, p.cupos, p.precio, p.activo,
              e.publicado, e.estado_aprobacion, e.activo AS estacionamiento_activo
         FROM plan_abono p
         JOIN estacionamiento e ON e.id_estacionamiento = p.id_estacionamiento
        WHERE p.id_plan = $1`,
      [id_plan],
    );
    const plan = rows[0];
    if (!plan || !plan.activo) throw ApiError.notFound('El plan no existe o ya no se ofrece');
    if (!aceptaReservas({ ...plan, activo: plan.estacionamiento_activo })) {
      throw ApiError.conflict('El estacionamiento no esta disponible para reservar');
    }

    const { rows: creado } = await client.query(
      `INSERT INTO abono
         (id_conductor, id_estacionamiento, id_plan, turno, cupos_totales, precio_total, desde, hasta)
       VALUES ($1, $2, $3, $4, $5, $6, ${HOY_LOCAL}, ${HOY_LOCAL} + $7::int)
       RETURNING id_abono`,
      [idConductor, plan.id_estacionamiento, plan.id_plan, plan.turno, plan.cupos, plan.precio, DIAS_VIGENCIA - 1],
    );

    return obtenerAbono(client, creado[0].id_abono);
  });
}

export async function listarPorConductor(idConductor) {
  const { rows } = await query(`${SELECT_ABONO} WHERE a.id_conductor = $1 ORDER BY a.created_at DESC`, [
    idConductor,
  ]);
  return rows.map(conRestantes);
}

export async function listarPorEstacionamiento(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);
  const { rows } = await query(
    `${SELECT_ABONO} WHERE a.id_estacionamiento = $1 ORDER BY a.created_at DESC`,
    [idEstacionamiento],
  );
  return rows.map(conRestantes);
}

/**
 * Cancela el abono y sus reservas que todavia no empezaron. Una ACTIVA (el
 * auto esta adentro) no se toca. No hay reembolso: el pago es simulado.
 * Igual que la baja de una cochera, las reservas se cancelan con un UPDATE
 * directo: CANCELADA no tiene efectos sobre la cochera.
 */
export async function cancelar(idAbono, idConductor) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id_conductor, estado::text AS estado FROM abono WHERE id_abono = $1 FOR UPDATE',
      [idAbono],
    );
    const abono = rows[0];
    // Ajeno = inexistente: no se revela que el abono existe.
    if (!abono || abono.id_conductor !== idConductor) throw ApiError.notFound('El abono no existe');
    if (abono.estado !== ESTADOS_ABONO.VIGENTE) {
      throw ApiError.conflict(`El abono ya esta ${abono.estado.toLowerCase()}`);
    }

    await client.query(
      `UPDATE reserva SET estado = 'CANCELADA', cancelada_por = 'CONDUCTOR'
        WHERE id_abono = $1 AND estado IN ('PENDIENTE', 'CONFIRMADA') AND inicio > now()`,
      [idAbono],
    );
    await client.query(`UPDATE abono SET estado = 'CANCELADO' WHERE id_abono = $1`, [idAbono]);

    return obtenerAbono(client, idAbono);
  });
}

/** Abonos vigentes cuya fecha `hasta` ya paso: los llama el job de vencimientos. */
export async function vencerAbonos() {
  const { rowCount } = await query(
    `UPDATE abono SET estado = 'VENCIDO' WHERE estado = 'VIGENTE' AND hasta < ${HOY_LOCAL}`,
  );
  return rowCount;
}

/**
 * Reglas para reservar con el abono. Se llama dentro de la transaccion de
 * reserva.service.js: crear, ANTES de bloquear vehiculo y cocheras. El
 * FOR UPDATE serializa dos reservas con el mismo abono: la segunda espera y
 * ya cuenta el uso de la primera, asi el ultimo uso no se consume dos veces.
 */
export async function validarAbonoParaReservar(client, idAbono, idConductor, inicio, fin) {
  const { rows } = await client.query(
    `SELECT id_abono, id_conductor, id_estacionamiento, turno::text AS turno, cupos_totales,
            estado::text AS estado, desde::text AS desde, hasta::text AS hasta
       FROM abono WHERE id_abono = $1 FOR UPDATE`,
    [idAbono],
  );
  const abono = rows[0];
  if (!abono || abono.id_conductor !== idConductor) throw ApiError.notFound('El abono no existe');
  if (abono.estado !== ESTADOS_ABONO.VIGENTE) {
    throw ApiError.conflict(`El abono esta ${abono.estado.toLowerCase()}`);
  }

  // Por fecha y no solo por estado: el job puede no haberlo vencido todavia.
  const dia = partesLocales(inicio).fecha;
  if (dia < abono.desde || dia > abono.hasta) {
    throw ApiError.conflict(`El abono vale del ${abono.desde} al ${abono.hasta}`);
  }

  const motivo = motivoFueraDeTurno(abono.turno, inicio, fin);
  if (motivo) throw ApiError.conflict(motivo);

  const { rows: usados } = await client.query(
    `SELECT COUNT(*)::int AS usados FROM reserva WHERE id_abono = $1 AND estado <> 'CANCELADA'`,
    [idAbono],
  );
  if (usados[0].usados >= abono.cupos_totales) throw ApiError.conflict('No te quedan usos en este abono');

  return abono;
}
