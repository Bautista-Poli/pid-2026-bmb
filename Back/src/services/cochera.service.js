import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ESTADOS_COCHERA, ESTADOS_RESERVA, ESTADOS_VIGENTES } from '../utils/roles.js';
import { sinSolapamiento } from '../utils/solapamiento.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_UNIQUE = '23505';
const VIOLACION_FK = '23503';
// ON DELETE RESTRICT falla con este codigo (NO ACTION usa el de arriba, 23001).
const VIOLACION_RESTRICT = '23503';

const CAMPOS =
  'id_cochera, id_estacionamiento, id_tipo_vehiculo, identificador, sector, cubierta, estado_actual, ' +
  'activo, bloqueada, motivo_bloqueo, bloqueada_hasta';

const CAMPOS_EDITABLES = ['identificador', 'id_tipo_vehiculo', 'sector', 'cubierta', 'estado_actual'];

/**
 * `identificador` es texto, asi que ordenarlo tal cual pone la cochera 10 antes
 * que la 2. Ordena por la parte numerica y deja al final los identificadores
 * alfanumericos viejos ("A-01"), que ya no se pueden dar de alta.
 */
export const ORDEN_NATURAL = `
  NULLIF(regexp_replace(c.identificador, '\\D', '', 'g'), '')::int NULLS LAST,
  c.identificador`;

/** Traduce las violaciones de constraints de COCHERA a errores entendibles. */
function traducirError(error, datos) {
  if (error.code === VIOLACION_UNIQUE) {
    throw ApiError.conflict(
      `El estacionamiento ya tiene una cochera con el identificador "${datos.identificador}"`,
    );
  }
  if (error.code === VIOLACION_FK) {
    throw ApiError.badRequest('El id_tipo_vehiculo indicado no existe');
  }
  throw error;
}

/** Alta de una cochera dentro de un estacionamiento del propietario autenticado. */
export async function crear(idEstacionamiento, idPropietario, datos) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  try {
    const { rows } = await query(
      `INSERT INTO cochera
         (id_estacionamiento, id_tipo_vehiculo, identificador, sector, cubierta, estado_actual)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${CAMPOS}`,
      [
        idEstacionamiento,
        datos.id_tipo_vehiculo,
        datos.identificador,
        datos.sector ?? null,
        datos.cubierta ?? false,
        datos.estado_actual,
      ],
    );
    return rows[0];
  } catch (error) {
    return traducirError(error, datos);
  }
}

/**
 * Alta por cantidad en una sola transaccion: si un lote falla no se crea nada.
 * Cada lote numera desde el siguiente libre de su prefijo (`PB-1`, `PB-2`, ...),
 * asi que un lote posterior con el mismo prefijo continua la numeracion.
 */
export async function crearLote(idEstacionamiento, idPropietario, lotes) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  let loteActual;
  try {
    return await withTransaction(async (client) => {
      const creadas = [];

      for (const lote of lotes) {
        loteActual = lote;
        const { rows: maximo } = await client.query(
          `SELECT COALESCE(MAX(substring(identificador FROM '^' || $2 || '-([0-9]+)$')::int), 0) AS ultimo
             FROM cochera WHERE id_estacionamiento = $1`,
          [idEstacionamiento, lote.prefijo],
        );
        const desde = maximo[0].ultimo + 1;

        const { rows } = await client.query(
          `INSERT INTO cochera
             (id_estacionamiento, id_tipo_vehiculo, identificador, sector, cubierta, estado_actual)
           SELECT $1, $2, $3 || '-' || n, $4, $5, $6
             FROM generate_series($7::int, $8::int) AS n
           RETURNING ${CAMPOS}`,
          [
            idEstacionamiento,
            lote.id_tipo_vehiculo,
            lote.prefijo,
            lote.sector,
            lote.cubierta ?? false,
            ESTADOS_COCHERA.LIBRE,
            desde,
            desde + lote.cantidad - 1,
          ],
        );
        creadas.push(...rows);
      }

      return creadas;
    });
  } catch (error) {
    return traducirError(error, { identificador: `${loteActual?.prefijo}-…` });
  }
}

/**
 * `reservada_ahora` indica si hay una reserva vigente transcurriendo: el
 * `estado_actual` es el estado fisico y una reserva no lo modifica.
 */
export async function listarPorEstacionamiento(idEstacionamiento) {
  const { rows } = await query(
    `SELECT c.id_cochera, c.id_estacionamiento, c.identificador, c.sector, c.cubierta,
            c.estado_actual, c.activo, c.id_tipo_vehiculo, t.nombre AS tipo_vehiculo,
            c.bloqueada, c.motivo_bloqueo, c.bloqueada_hasta,
            EXISTS (
              SELECT 1 FROM reserva r
               WHERE r.id_cochera = c.id_cochera
                 AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
                 AND r.inicio <= now() AND r.fin > now()
            ) AS reservada_ahora
       FROM cochera c
       JOIN tipo_vehiculo t ON t.id_tipo_vehiculo = c.id_tipo_vehiculo
      WHERE c.id_estacionamiento = $1
      ORDER BY ${ORDEN_NATURAL}`,
    [idEstacionamiento],
  );
  return rows;
}

/** Modifica identificador, tipo de vehiculo, sector, cubierta y/o estado de una cochera propia. */
export async function actualizar(idEstacionamiento, idPropietario, idCochera, datos) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  if (datos.estado_actual === ESTADOS_COCHERA.INACTIVA) {
    throw ApiError.badRequest('Para desactivar una cochera usa la baja (DELETE), no el estado');
  }

  const asignaciones = [];
  const parametros = [];
  for (const campo of CAMPOS_EDITABLES) {
    if (datos[campo] === undefined) continue;
    parametros.push(datos[campo]);
    asignaciones.push(`${campo} = $${parametros.length}`);
  }
  parametros.push(idCochera, idEstacionamiento);

  let rows;
  try {
    ({ rows } = await query(
      `UPDATE cochera SET ${asignaciones.join(', ')}
        WHERE id_cochera = $${parametros.length - 1} AND id_estacionamiento = $${parametros.length}
        RETURNING ${CAMPOS}`,
      parametros,
    ));
  } catch (error) {
    return traducirError(error, datos);
  }

  if (!rows[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
  return rows[0];
}

/**
 * Baja logica: la cochera puede tener reservas historicas (FK RESTRICT), asi
 * que se desactiva en vez de borrarse. Las reservas vigentes se cancelan, igual
 * que al dar de baja el estacionamiento entero.
 */
export async function darDeBaja(idEstacionamiento, idPropietario, idCochera) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  return withTransaction(async (client) => {
    const { rows: existentes } = await client.query(
      'SELECT activo FROM cochera WHERE id_cochera = $1 AND id_estacionamiento = $2 FOR UPDATE',
      [idCochera, idEstacionamiento],
    );
    if (!existentes[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
    if (!existentes[0].activo) throw ApiError.conflict('La cochera ya esta dada de baja');

    await client.query(
      `UPDATE reserva SET estado = 'CANCELADA'
        WHERE id_cochera = $1 AND estado = ANY($2::estado_reserva[]) AND fin > now()`,
      [idCochera, ESTADOS_VIGENTES],
    );

    const { rows } = await client.query(
      `UPDATE cochera SET activo = FALSE, estado_actual = $1
        WHERE id_cochera = $2
        RETURNING ${CAMPOS}`,
      [ESTADOS_COCHERA.INACTIVA, idCochera],
    );
    return rows[0];
  });
}

/** Deshace la baja logica. No se puede reactivar dentro de un estacionamiento dado de baja. */
export async function reactivar(idEstacionamiento, idPropietario, idCochera) {
  const estacionamiento = await asegurarPropiedad(idEstacionamiento, idPropietario);
  if (!estacionamiento.activo) {
    throw ApiError.conflict('El estacionamiento esta dado de baja: no se puede reactivar una cochera');
  }

  const { rows: existentes } = await query(
    'SELECT activo FROM cochera WHERE id_cochera = $1 AND id_estacionamiento = $2',
    [idCochera, idEstacionamiento],
  );
  if (!existentes[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
  if (existentes[0].activo) throw ApiError.conflict('La cochera ya esta activa');

  const { rows } = await query(
    `UPDATE cochera SET activo = TRUE, estado_actual = $1
      WHERE id_cochera = $2
      RETURNING ${CAMPOS}`,
    [ESTADOS_COCHERA.LIBRE, idCochera],
  );
  return rows[0];
}

/** Otra cochera libre del mismo estacionamiento, mismo tipo de vehiculo, para esa franja exacta. */
async function buscarAlternativa(client, idEstacionamiento, idCocheraOriginal, idTipoVehiculo, inicio, fin) {
  const { rows: candidatas } = await client.query(
    `SELECT c.id_cochera
       FROM cochera c
      WHERE c.id_estacionamiento = $1
        AND c.id_cochera <> $2
        AND c.activo
        AND NOT c.bloqueada
        AND c.estado_actual <> $3
        AND c.id_tipo_vehiculo = $4
      ORDER BY c.id_cochera
      FOR UPDATE`,
    [idEstacionamiento, idCocheraOriginal, ESTADOS_COCHERA.INACTIVA, idTipoVehiculo],
  );
  if (candidatas.length === 0) return null;

  const { rows: libres } = await client.query(
    `SELECT c.id_cochera
       FROM cochera c
      WHERE c.id_cochera = ANY($1::uuid[])
        AND ${sinSolapamiento('$2', '$3', '$4')}
      ORDER BY ${ORDEN_NATURAL}
      LIMIT 1`,
    [candidatas.map((c) => c.id_cochera), ESTADOS_VIGENTES, inicio, fin],
  );
  return libres[0]?.id_cochera ?? null;
}

const AVISO_REASIGNADA =
  'Te reasignamos a otra cochera del mismo estacionamiento: la tuya entro en mantenimiento.';
const AVISO_CANCELADA_SIN_ALTERNATIVA =
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
        WHERE r.id_cochera = $1 AND r.estado = ANY($2::estado_reserva[]) AND r.fin > now()
        FOR UPDATE OF r`,
      [idCochera, ESTADOS_VIGENTES],
    );

    if (afectadas.some((r) => r.estado === ESTADOS_RESERVA.ACTIVA)) {
      throw ApiError.conflict('No se puede bloquear: hay un vehiculo adentro en este momento');
    }

    const reasignadas = [];
    const sinAlternativa = [];
    for (const reserva of afectadas) {
      const alternativa = await buscarAlternativa(
        client, idEstacionamiento, idCochera, reserva.id_tipo_vehiculo, reserva.inicio, reserva.fin,
      );
      if (alternativa) reasignadas.push({ reserva, idCocheraNueva: alternativa });
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
        "UPDATE reserva SET estado = 'CANCELADA', motivo_reasignacion = $1 WHERE id_reserva = $2",
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

/** Cocheras con `bloqueada_hasta` ya vencido: las llama el job de vencimientos. */
export async function desbloquearVencidas() {
  const { rows } = await query(
    `UPDATE cochera SET bloqueada = FALSE, motivo_bloqueo = NULL, bloqueada_hasta = NULL
      WHERE bloqueada AND bloqueada_hasta IS NOT NULL AND bloqueada_hasta <= now()
      RETURNING id_cochera`,
  );
  return rows.length;
}

/**
 * Borrado fisico, para una cochera cargada por error. Primero hay que darla de
 * baja (pasar por INACTIVA) y solo procede si nunca tuvo reservas: con historial
 * la FK lo impide y la cochera queda inactiva.
 */
export async function eliminar(idEstacionamiento, idPropietario, idCochera) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    'SELECT activo FROM cochera WHERE id_cochera = $1 AND id_estacionamiento = $2',
    [idCochera, idEstacionamiento],
  );
  if (!rows[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
  if (rows[0].activo) throw ApiError.conflict('Primero da de baja la cochera para poder eliminarla');

  try {
    await query('DELETE FROM cochera WHERE id_cochera = $1', [idCochera]);
  } catch (error) {
    if (error.code === VIOLACION_RESTRICT) {
      throw ApiError.conflict('La cochera tiene reservas en su historial: queda inactiva, no se puede eliminar');
    }
    throw error;
  }
}
