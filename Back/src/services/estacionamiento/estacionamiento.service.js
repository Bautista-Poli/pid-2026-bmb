// Estacionamientos: alta, detalle y edicion (vuelve a revision si cambia nombre o
// direccion). La busqueda publica esta en estacionamiento-busqueda.service.js y
// la baja en estacionamiento-baja.service.js.
import { query, withTransaction } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { armarSet } from '../../utils/sql.js';
import { CAMPOS_TARIFA } from '../../utils/tarifas.js';
import { ESTADOS_APROBACION } from '../../utils/roles.js';
import { listarPorEstacionamiento as listarCocheras } from '../cochera/cochera.service.js';
import { DIAS_BUSQUEDA } from '../reputacion/reputacion-reglas.js';
import { COLUMNAS_REPUTACION, darFormaReputacion, lateralReputacion } from '../reputacion/reputacion-sql.js';

/** Reputacion publica (calificaciones e insignias) de los ultimos DIAS_BUSQUEDA dias. */
export const reputacionPublica = () => lateralReputacion(`now() - interval '${DIAS_BUSQUEDA} days'`, 'now()');

const CAMPOS_DIRECCION = ['calle', 'numero', 'ciudad', 'provincia'];
// Si cambia alguno de estos en uno aprobado, vuelve a la cola de revision.
const CAMPOS_REVISION = ['nombre', ...CAMPOS_DIRECCION];
const COLUMNAS = [
  'id_estacionamiento', 'id_propietario', 'nombre', 'descripcion', 'direccion',
  'calle', 'numero', 'ciudad', 'provincia', 'codigo_postal', 'barrio_zona',
  'latitud', 'longitud', 'telefono_contacto', 'email_contacto',
  'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada', 'politica_cancelacion_horas',
  'cubierto', 'publicado', 'activo',
  'estado_aprobacion', 'motivo_rechazo', 'enviado_en', 'created_at',
];

const CAMPOS_EDITABLES = [
  'nombre', 'descripcion', 'calle', 'numero', 'ciudad', 'provincia', 'codigo_postal',
  'barrio_zona', 'latitud', 'longitud', 'telefono_contacto', 'email_contacto',
  'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada', 'politica_cancelacion_horas',
  'cubierto', 'publicado',
];

export const CAMPOS = COLUMNAS.join(', ');
export const CAMPOS_E = COLUMNAS.map((columna) => `e.${columna}`).join(', ');

/**
 * Datos derivados que muestran los listados y el detalle.
 * `cocheras_libres` cuenta las cocheras activas, marcadas LIBRE y sin una
 * reserva vigente transcurriendo en este momento.
 */
export const AGREGADOS = `
  (SELECT COUNT(*)::int
     FROM cochera c
    WHERE c.id_estacionamiento = e.id_estacionamiento AND c.activo) AS cocheras_activas,
  (SELECT COUNT(*)::int
     FROM cochera c
    WHERE c.id_estacionamiento = e.id_estacionamiento
      AND c.activo
      AND NOT c.bloqueada
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
    WHERE h.id_estacionamiento = e.id_estacionamiento) AS horarios
`;

/**
 * Crea el estacionamiento y sus horarios en una sola transaccion.
 */
export async function crear(idPropietario, datos) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO estacionamiento
         (id_propietario, nombre, descripcion, direccion, calle, numero, ciudad, provincia,
          codigo_postal, barrio_zona, latitud, longitud, telefono_contacto, email_contacto,
          tarifa_hora, tarifa_estadia, tarifa_jornada, politica_cancelacion_horas, cubierto, publicado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
        datos.politica_cancelacion_horas ?? null,
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
 * Detalle de un estacionamiento. Mientras no este aprobado solo lo ven su dueno
 * y el administrador: para el resto no existe (404), igual que en la busqueda.
 */
export async function obtenerPorId(idEstacionamiento, { idSolicitante = null, esAdmin = false } = {}) {
  const { rows } = await query(
    `SELECT ${CAMPOS_E}, ${AGREGADOS}, ${COLUMNAS_REPUTACION}
       FROM estacionamiento e
       ${reputacionPublica()}
      WHERE e.id_estacionamiento = $1`,
    [idEstacionamiento],
  );
  if (rows[0]) darFormaReputacion(rows[0]);

  const visible =
    rows[0] &&
    (rows[0].estado_aprobacion === ESTADOS_APROBACION.APROBADO ||
      esAdmin ||
      rows[0].id_propietario === idSolicitante);
  if (!visible) throw ApiError.notFound('Estacionamiento no encontrado');

  const estacionamiento = rows[0];
  estacionamiento.cocheras = await listarCocheras(idEstacionamiento);
  return estacionamiento;
}

/**
 * Un estacionamiento recibe reservas si esta activo, publicado por su dueno y
 * aprobado por el administrador. `fila` trae `activo`, `publicado` y
 * `estado_aprobacion`.
 */
export function aceptaReservas(fila, { conAbono = false } = {}) {
  // Un abono ya pagado se sigue usando aunque el estacionamiento haya vuelto a
  // revision por un cambio de nombre o direccion: lo que no se vende es nuevo.
  // Si el administrador lo rechazo, tampoco se usa el abono.
  const aprobado =
    fila.estado_aprobacion === ESTADOS_APROBACION.APROBADO ||
    (conAbono && fila.estado_aprobacion === ESTADOS_APROBACION.PENDIENTE);
  return fila.activo && fila.publicado && aprobado;
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

/** Los estacionamientos del propietario, con sus agregados y reputacion. */
export async function listarPorPropietario(idPropietario) {
  const { rows } = await query(
    `SELECT ${CAMPOS_E}, ${AGREGADOS}, ${COLUMNAS_REPUTACION}
       FROM estacionamiento e
       ${reputacionPublica()}
      WHERE e.id_propietario = $1
      ORDER BY e.nombre`,
    [idPropietario],
  );
  return rows.map(darFormaReputacion);
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
 * Si cambiaron el nombre o la direccion (lo que verifica el administrador) y en
 * que estado de aprobacion estaba. Un aprobado con cambios vuelve a PENDIENTE: El formulario manda siempre todos los
 * campos, asi que se compara contra lo guardado (fila ya bloqueada por
 * `asegurarAlgunaTarifa`). Las reservas existentes no se tocan.
 */
async function cambiosDeRevision(client, idEstacionamiento, datos) {
  const { rows } = await client.query(
    `SELECT estado_aprobacion, ${CAMPOS_REVISION.join(', ')}
       FROM estacionamiento WHERE id_estacionamiento = $1`,
    [idEstacionamiento],
  );
  const guardado = rows[0];
  const cambio = CAMPOS_REVISION.some(
    (campo) => datos[campo] !== undefined && (datos[campo] ?? '') !== (guardado[campo] ?? ''),
  );
  return { cambio, estado: guardado.estado_aprobacion };
}

/**
 * El propietario vuelve a mandar a revision uno rechazado, cuando quiera: con
 * o sin cambios, sin esperar. Solo desde RECHAZADO.
 */
export async function reenviarRevision(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    `UPDATE estacionamiento
        SET estado_aprobacion = '${ESTADOS_APROBACION.PENDIENTE}', motivo_rechazo = NULL, enviado_en = now(),
            revisado_por = NULL, revisado_en = NULL
      WHERE id_estacionamiento = $1
        AND estado_aprobacion = '${ESTADOS_APROBACION.RECHAZADO}'
        AND activo
      RETURNING id_estacionamiento`,
    [idEstacionamiento],
  );
  if (!rows[0]) throw ApiError.conflict('Solo se puede reenviar a revision un estacionamiento rechazado');

  return obtenerPorId(idEstacionamiento, { idSolicitante: idPropietario });
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
    const parametros = [];
    const asignaciones = armarSet(CAMPOS_EDITABLES, datos, parametros);

    const { cambio, estado } = await cambiosDeRevision(client, idEstacionamiento, datos);
    if (cambio && estado === ESTADOS_APROBACION.APROBADO) {
      asignaciones.push(
        `estado_aprobacion = '${ESTADOS_APROBACION.PENDIENTE}'`,
        'enviado_en = now()',
        'revisado_por = NULL',
        'revisado_en = NULL',
      );
    } else if (cambio && estado === ESTADOS_APROBACION.PENDIENTE) {
      // Sigue en la cola, pero es otra version: el admin que estaba mirando la
      // anterior no la puede aprobar sin recargar (ver admin.service.js: decidir).
      asignaciones.push('enviado_en = now()');
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

  return obtenerPorId(idEstacionamiento, { idSolicitante: idPropietario });
}
