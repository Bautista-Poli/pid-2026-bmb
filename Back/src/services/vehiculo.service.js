import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { errorPatente } from '../validators/vehiculo.validator.js';

const VIOLACION_UNIQUE = '23505';
const VIOLACION_FK = '23503';

const CAMPOS = `
  id_vehiculo, id_conductor, id_tipo_vehiculo, patente, marca, modelo, color,
  predeterminado, activo
`;

// Columnas que el PATCH puede tocar; predeterminado se maneja aparte por el
// indice `vehiculo_un_predeterminado` (uno solo por conductor).
const CAMPOS_EDITABLES = ['patente', 'id_tipo_vehiculo', 'marca', 'modelo', 'color'];

/** Traduce las violaciones de constraints de VEHICULO a errores entendibles. */
function traducirError(error, datos) {
  if (error.code === VIOLACION_UNIQUE && error.constraint === 'vehiculo_patente_unica') {
    throw ApiError.conflict(`La patente ${datos.patente} ya esta registrada`);
  }
  if (error.code === VIOLACION_FK) {
    throw ApiError.badRequest('El id_tipo_vehiculo indicado no existe');
  }
  throw error;
}

/**
 * Registra un vehiculo. El primero del conductor queda como predeterminado; si
 * se pide `predeterminado: true` explicitamente, reemplaza al anterior (el
 * indice `vehiculo_un_predeterminado` impide que haya dos).
 */
export async function crear(idConductor, datos) {
  try {
    return await withTransaction(async (client) => {
      const { rowCount: tieneVehiculos } = await client.query(
        'SELECT 1 FROM vehiculo WHERE id_conductor = $1 AND activo LIMIT 1',
        [idConductor],
      );

      const predeterminado = datos.predeterminado ?? tieneVehiculos === 0;

      if (predeterminado) {
        await client.query(
          'UPDATE vehiculo SET predeterminado = FALSE WHERE id_conductor = $1 AND predeterminado',
          [idConductor],
        );
      }

      const { rows } = await client.query(
        `INSERT INTO vehiculo
           (id_conductor, id_tipo_vehiculo, patente, marca, modelo, color, predeterminado)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${CAMPOS}`,
        [
          idConductor,
          datos.id_tipo_vehiculo,
          datos.patente,
          datos.marca ?? null,
          datos.modelo ?? null,
          datos.color ?? null,
          predeterminado,
        ],
      );
      return rows[0];
    });
  } catch (error) {
    return traducirError(error, datos);
  }
}

export async function listarPorConductor(idConductor) {
  const { rows } = await query(
    `SELECT v.id_vehiculo, v.id_conductor, v.id_tipo_vehiculo, v.patente,
            v.marca, v.modelo, v.color, v.predeterminado, v.activo,
            t.nombre AS tipo_vehiculo
       FROM vehiculo v
       JOIN tipo_vehiculo t ON t.id_tipo_vehiculo = v.id_tipo_vehiculo
      WHERE v.id_conductor = $1
        AND v.activo = TRUE
      ORDER BY v.predeterminado DESC, v.patente`,
    [idConductor],
  );
  return rows;
}

export async function obtenerDelConductor(idVehiculo, idConductor) {
  const { rows } = await query(
    `SELECT ${CAMPOS} FROM vehiculo WHERE id_vehiculo = $1 AND id_conductor = $2`,
    [idVehiculo, idConductor],
  );

  if (!rows[0]) throw ApiError.notFound('Vehiculo no encontrado para este conductor');
  return rows[0];
}

/**
 * Actualiza solo los campos presentes en `cambios`. Verifica antes que el
 * vehiculo sea del conductor (404 si no) para no filtrar los de otros.
 * Marcar `predeterminado: true` desmarca al que lo era (indice de uno solo).
 */
export async function actualizar(idVehiculo, idConductor, cambios) {
  return withTransaction(async (client) => {
    const { rows: propio } = await client.query(
      'SELECT patente, id_tipo_vehiculo FROM vehiculo WHERE id_vehiculo = $1 AND id_conductor = $2',
      [idVehiculo, idConductor],
    );
    if (!propio[0]) throw ApiError.notFound('Vehiculo no encontrado para este conductor');

    // Si cambia solo la patente o solo el tipo, el validador no pudo cruzarlos:
    // se verifica el par resultante contra lo guardado.
    if ((cambios.patente === undefined) !== (cambios.id_tipo_vehiculo === undefined)) {
      const error = errorPatente(
        cambios.patente ?? propio[0].patente,
        cambios.id_tipo_vehiculo ?? propio[0].id_tipo_vehiculo,
      );
      if (error) throw ApiError.badRequest('Datos invalidos', [{ campo: 'patente', mensaje: error }]);
    }

    if (cambios.predeterminado === true) {
      await client.query(
        `UPDATE vehiculo SET predeterminado = FALSE
          WHERE id_conductor = $1 AND predeterminado AND id_vehiculo <> $2`,
        [idConductor, idVehiculo],
      );
    }

    const sets = [];
    const valores = [];
    for (const columna of [...CAMPOS_EDITABLES, 'predeterminado']) {
      if (cambios[columna] !== undefined) {
        valores.push(cambios[columna]);
        sets.push(`${columna} = $${valores.length}`);
      }
    }

    // Sin campos para tocar, se devuelve el vehiculo tal cual.
    if (sets.length === 0) {
      const { rows } = await client.query(
        `SELECT ${CAMPOS} FROM vehiculo WHERE id_vehiculo = $1`,
        [idVehiculo],
      );
      return rows[0];
    }

    valores.push(idVehiculo, idConductor);
    try {
      const { rows } = await client.query(
        `UPDATE vehiculo SET ${sets.join(', ')}
          WHERE id_vehiculo = $${valores.length - 1} AND id_conductor = $${valores.length}
          RETURNING ${CAMPOS}`,
        valores,
      );
      return rows[0];
    } catch (error) {
      return traducirError(error, cambios);
    }
  });
}

/** Baja logica: marca activo = false y libera el predeterminado, no borra la fila. */
export async function darDeBaja(idVehiculo, idConductor) {
  await obtenerDelConductor(idVehiculo, idConductor);

  const { rows } = await query(
    `UPDATE vehiculo SET activo = FALSE, predeterminado = FALSE
      WHERE id_vehiculo = $1 AND id_conductor = $2
      RETURNING ${CAMPOS}`,
    [idVehiculo, idConductor],
  );
  return rows[0];
}

export async function listarTipos() {
  const { rows } = await query(
    'SELECT id_tipo_vehiculo, nombre FROM tipo_vehiculo ORDER BY id_tipo_vehiculo',
  );
  return rows;
}
