import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { CAMPOS_TARIFA } from '../utils/tarifas.js';
import { ESTADOS_COCHERA, ESTADOS_VIGENTES } from '../utils/roles.js';
import { listarPorEstacionamiento as listarCocheras } from './cochera.service.js';

const COLUMNAS = [
  'id_estacionamiento', 'id_propietario', 'nombre', 'descripcion', 'direccion',
  'calle', 'numero', 'ciudad', 'provincia', 'codigo_postal', 'barrio_zona',
  'latitud', 'longitud', 'telefono_contacto', 'email_contacto',
  'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada',
  'cubierto', 'publicado', 'activo',
];

const CAMPOS_EDITABLES = [
  'nombre', 'descripcion', 'calle', 'numero', 'ciudad', 'provincia', 'codigo_postal',
  'barrio_zona', 'latitud', 'longitud', 'telefono_contacto', 'email_contacto',
  'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada', 'cubierto', 'publicado',
];

const CAMPOS = COLUMNAS.join(', ');
const CAMPOS_E = COLUMNAS.map((columna) => `e.${columna}`).join(', ');

/**
 * Datos derivados que muestran los listados y el detalle.
 * `cocheras_libres` cuenta las cocheras activas, marcadas LIBRE y sin una
 * reserva vigente transcurriendo en este momento.
 */
const AGREGADOS = `
  (SELECT COUNT(*)::int
     FROM cochera c
    WHERE c.id_estacionamiento = e.id_estacionamiento AND c.activo) AS cocheras_activas,
  (SELECT COUNT(*)::int
     FROM cochera c
    WHERE c.id_estacionamiento = e.id_estacionamiento
      AND c.activo
      AND c.estado_actual = 'LIBRE'
      AND NOT EXISTS (
        SELECT 1 FROM reserva r
         WHERE r.id_cochera = c.id_cochera
           AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
           AND r.inicio <= now() AND r.fin > now()
      )) AS cocheras_libres,
  (SELECT COALESCE(array_agg(DISTINCT c.id_tipo_vehiculo ORDER BY c.id_tipo_vehiculo), '{}')
     FROM cochera c
    WHERE c.id_estacionamiento = e.id_estacionamiento AND c.activo) AS tipos_vehiculo,
  (SELECT COALESCE(json_agg(json_build_object(
            'dia_semana', h.dia_semana,
            'hora_apertura', to_char(h.hora_apertura, 'HH24:MI'),
            'hora_cierre', to_char(h.hora_cierre, 'HH24:MI')
          ) ORDER BY h.dia_semana), '[]'::json)
     FROM horario h
    WHERE h.id_estacionamiento = e.id_estacionamiento) AS horarios,
  (SELECT f.actualizada
     FROM estacionamiento_foto f
    WHERE f.id_estacionamiento = e.id_estacionamiento) AS foto_actualizada
`;

/** Crea el estacionamiento y sus horarios en una sola transaccion. */
export async function crear(idPropietario, datos) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO estacionamiento
         (id_propietario, nombre, descripcion, direccion, calle, numero, ciudad, provincia,
          codigo_postal, barrio_zona, latitud, longitud, telefono_contacto, email_contacto,
          tarifa_hora, tarifa_estadia, tarifa_jornada, cubierto, publicado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING ${CAMPOS}`,
      [
        idPropietario,
        datos.nombre,
        datos.descripcion ?? null,
        datos.direccion,
        datos.calle,
        datos.numero,
        datos.ciudad,
        datos.provincia,
        datos.codigo_postal ?? null,
        datos.barrio_zona ?? null,
        datos.latitud ?? null,
        datos.longitud ?? null,
        datos.telefono_contacto ?? null,
        datos.email_contacto ?? null,
        datos.tarifa_hora ?? null,
        datos.tarifa_estadia ?? null,
        datos.tarifa_jornada ?? null,
        datos.cubierto ?? false,
        datos.publicado ?? false,
      ],
    );

    const estacionamiento = rows[0];
    estacionamiento.horarios = await insertarHorarios(
      client,
      estacionamiento.id_estacionamiento,
      datos.horarios,
    );

    return estacionamiento;
  });
}

/** Carga los horarios de un estacionamiento dentro de la transaccion abierta. */
async function insertarHorarios(client, idEstacionamiento, horarios) {
  const cargados = [];

  for (const horario of horarios ?? []) {
    const { rows } = await client.query(
      `INSERT INTO horario (id_estacionamiento, dia_semana, hora_apertura, hora_cierre)
       VALUES ($1, $2, $3, $4)
       RETURNING id_horario, dia_semana, hora_apertura, hora_cierre`,
      [idEstacionamiento, horario.dia_semana, horario.hora_apertura, horario.hora_cierre],
    );
    cargados.push(rows[0]);
  }

  return cargados;
}

/**
 * Busqueda publica: solo estacionamientos publicados y activos, con cocheras
 * libres, tipos admitidos y horarios para poder comparar opciones.
 */
export async function buscar(filtros) {
  const condiciones = ['e.publicado = TRUE', 'e.activo = TRUE'];
  const parametros = [];

  if (filtros.q) {
    parametros.push(`%${filtros.q}%`);
    const p = `$${parametros.length}`;
    condiciones.push(
      `(e.nombre ILIKE ${p} OR e.direccion ILIKE ${p} OR e.barrio_zona ILIKE ${p} OR e.descripcion ILIKE ${p})`,
    );
  }

  if (filtros.zona) {
    parametros.push(`%${filtros.zona}%`);
    condiciones.push(`e.barrio_zona ILIKE $${parametros.length}`);
  }

  if (filtros.tarifa_max !== undefined) {
    parametros.push(filtros.tarifa_max);
    condiciones.push(`e.tarifa_hora <= $${parametros.length}`);
  }

  if (filtros.cubierto !== undefined) {
    parametros.push(filtros.cubierto);
    condiciones.push(`e.cubierto = $${parametros.length}`);
  }

  if (filtros.id_tipo_vehiculo !== undefined) {
    parametros.push(filtros.id_tipo_vehiculo);
    condiciones.push(`EXISTS (
      SELECT 1 FROM cochera ct
      WHERE ct.id_estacionamiento = e.id_estacionamiento
        AND ct.activo = TRUE
        AND ct.id_tipo_vehiculo = $${parametros.length}
    )`);
  }

  parametros.push(filtros.limit, filtros.offset);

  const { rows } = await query(
    `SELECT ${CAMPOS_E}, ${AGREGADOS}
       FROM estacionamiento e
      WHERE ${condiciones.join(' AND ')}
      ORDER BY e.nombre
      LIMIT $${parametros.length - 1} OFFSET $${parametros.length}`,
    parametros,
  );

  return rows;
}

export async function obtenerPorId(idEstacionamiento) {
  const { rows } = await query(
    `SELECT ${CAMPOS_E}, ${AGREGADOS}
       FROM estacionamiento e
      WHERE e.id_estacionamiento = $1`,
    [idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');

  const estacionamiento = rows[0];
  estacionamiento.cocheras = await listarCocheras(idEstacionamiento);
  return estacionamiento;
}

/** Verifica que el estacionamiento exista y sea del propietario autenticado. */
export async function asegurarPropiedad(idEstacionamiento, idPropietario) {
  const { rows } = await query(
    `SELECT id_estacionamiento, id_propietario, activo
       FROM estacionamiento WHERE id_estacionamiento = $1`,
    [idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');
  if (rows[0].id_propietario !== idPropietario) {
    throw ApiError.forbidden('El estacionamiento pertenece a otro propietario');
  }

  return rows[0];
}

export async function listarPorPropietario(idPropietario) {
  const { rows } = await query(
    `SELECT ${CAMPOS_E}, ${AGREGADOS}
       FROM estacionamiento e
      WHERE e.id_propietario = $1
      ORDER BY e.nombre`,
    [idPropietario],
  );
  return rows;
}

/**
 * Despues de aplicar los cambios el estacionamiento tiene que seguir ofreciendo
 * alguna modalidad. Se toma la fila con FOR UPDATE para que dos PATCH
 * simultaneos no puedan borrar entre los dos todas las tarifas.
 */
async function asegurarAlgunaTarifa(client, idEstacionamiento, datos) {
  const { rows } = await client.query(
    `SELECT ${CAMPOS_TARIFA.join(', ')}
       FROM estacionamiento WHERE id_estacionamiento = $1 FOR UPDATE`,
    [idEstacionamiento],
  );

  const ofreceAlguna = CAMPOS_TARIFA.some((campo) => {
    const resultante = datos[campo] !== undefined ? datos[campo] : rows[0][campo];
    return resultante !== null;
  });

  if (!ofreceAlguna) {
    throw ApiError.badRequest(
      'El estacionamiento tiene que ofrecer al menos una tarifa (hora, estadia o jornada)',
    );
  }
}

/**
 * Modifica los datos del estacionamiento. Si vienen `horarios` reemplazan a los
 * cargados: es lo que espera la pantalla, que manda la semana completa.
 */
export async function actualizar(idEstacionamiento, idPropietario, datos) {
  const { activo } = await asegurarPropiedad(idEstacionamiento, idPropietario);
  if (!activo) throw ApiError.conflict('El estacionamiento esta dado de baja');

  await withTransaction(async (client) => {
    await asegurarAlgunaTarifa(client, idEstacionamiento, datos);
    const asignaciones = [];
    const parametros = [];

    for (const campo of CAMPOS_EDITABLES) {
      if (datos[campo] === undefined) continue;
      parametros.push(datos[campo]);
      asignaciones.push(`${campo} = $${parametros.length}`);
    }

    if (asignaciones.length > 0) {
      parametros.push(idEstacionamiento);
      await client.query(
        `UPDATE estacionamiento SET ${asignaciones.join(', ')}
          WHERE id_estacionamiento = $${parametros.length}`,
        parametros,
      );
    }

    // `direccion` es calle + numero: se rearma con los valores ya guardados.
    if (datos.calle !== undefined || datos.numero !== undefined) {
      await client.query(
        `UPDATE estacionamiento SET direccion = calle || ' ' || numero
          WHERE id_estacionamiento = $1`,
        [idEstacionamiento],
      );
    }

    if (datos.horarios !== undefined) {
      await client.query('DELETE FROM horario WHERE id_estacionamiento = $1', [idEstacionamiento]);
      await insertarHorarios(client, idEstacionamiento, datos.horarios);
    }
  });

  return obtenerPorId(idEstacionamiento);
}

/**
 * Baja logica: las cocheras tienen reservas historicas (FK RESTRICT), asi que
 * se desactiva todo en cascada y se cancelan las reservas que todavia no
 * empezaron. Para sacarlo del listado sin darlo de baja alcanza con
 * `PATCH { publicado: false }`.
 */
export async function darDeBaja(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT activo FROM estacionamiento WHERE id_estacionamiento = $1 FOR UPDATE',
      [idEstacionamiento],
    );

    if (!rows[0].activo) throw ApiError.conflict('El estacionamiento ya esta dado de baja');

    await client.query(
      `UPDATE reserva r SET estado = 'CANCELADA'
         FROM cochera c
        WHERE c.id_cochera = r.id_cochera
          AND c.id_estacionamiento = $1
          AND r.estado = ANY($2::estado_reserva[])
          AND r.fin > now()`,
      [idEstacionamiento, ESTADOS_VIGENTES],
    );

    await client.query(
      'UPDATE cochera SET activo = FALSE, estado_actual = $1 WHERE id_estacionamiento = $2',
      [ESTADOS_COCHERA.INACTIVA, idEstacionamiento],
    );

    const { rows: actualizado } = await client.query(
      `UPDATE estacionamiento SET activo = FALSE, publicado = FALSE
        WHERE id_estacionamiento = $1
        RETURNING ${CAMPOS}`,
      [idEstacionamiento],
    );

    return actualizado[0];
  });
}
