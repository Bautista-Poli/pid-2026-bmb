import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ESTADOS_COCHERA } from '../utils/roles.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_UNIQUE = '23505';
const VIOLACION_FK = '23503';

const CAMPOS =
  'id_cochera, id_estacionamiento, id_tipo_vehiculo, identificador, sector, cubierta, estado_actual, activo';

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
 * que se desactiva en vez de borrarse.
 */
export async function darDeBaja(idEstacionamiento, idPropietario, idCochera) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    `UPDATE cochera SET activo = FALSE, estado_actual = $1
      WHERE id_cochera = $2 AND id_estacionamiento = $3
      RETURNING ${CAMPOS}`,
    [ESTADOS_COCHERA.INACTIVA, idCochera, idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
  return rows[0];
}
