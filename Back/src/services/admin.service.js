import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ESTADOS_APROBACION } from '../utils/roles.js';
import { AGREGADOS, CAMPOS_E, obtenerPorId } from './estacionamiento.service.js';

/**
 * Revision de estacionamientos por el Administrador de plataforma. Cada
 * estacionamiento nace PENDIENTE y solo se ve en la busqueda cuando se aprueba.
 */

const PROPIETARIO = `
  (SELECT json_build_object('nombre', u.nombre, 'apellido', u.apellido,
                            'email', u.email, 'telefono', u.telefono)
     FROM usuario u WHERE u.id_usuario = e.id_propietario) AS propietario`;

/** Los estacionamientos activos en un estado, el que espera hace mas primero. */
export async function listarEstacionamientos({ estado }) {
  const { rows } = await query(
    `SELECT ${CAMPOS_E}, ${AGREGADOS}, ${PROPIETARIO}
       FROM estacionamiento e
      WHERE e.estado_aprobacion = $1 AND e.activo
      ORDER BY e.enviado_en, e.nombre`,
    [estado],
  );
  return rows;
}

/** Detalle completo para revisar, en cualquier estado, con el propietario. */
export async function obtenerEstacionamiento(idEstacionamiento) {
  const estacionamiento = await obtenerPorId(idEstacionamiento, { esAdmin: true });
  const { rows } = await query(
    `SELECT ${PROPIETARIO} FROM estacionamiento e WHERE e.id_estacionamiento = $1`,
    [idEstacionamiento],
  );
  estacionamiento.propietario = rows[0].propietario;
  return estacionamiento;
}

/**
 * Cierra la revision de un PENDIENTE. El WHERE sobre el estado hace que dos
 * admins a la vez no puedan decidir los dos: el segundo recibe 409.
 *
 * `enviadoEn` es la version que el admin tenia en pantalla: si el propietario
 * cambio el nombre o la direccion mientras tanto, `enviado_en` ya es otro y la
 * decision se rechaza, para no aprobar algo que nadie vio. Se compara al
 * milisegundo porque es la precision con la que viaja por JSON.
 */
async function decidir(idEstacionamiento, idAdmin, estado, motivo, enviadoEn = null) {
  const { rows } = await query(
    `UPDATE estacionamiento
        SET estado_aprobacion = $3, motivo_rechazo = $4, revisado_por = $2, revisado_en = now()
      WHERE id_estacionamiento = $1
        AND estado_aprobacion = '${ESTADOS_APROBACION.PENDIENTE}'
        AND ($5::timestamptz IS NULL
             OR date_trunc('milliseconds', enviado_en) = date_trunc('milliseconds', $5::timestamptz))
      RETURNING id_estacionamiento`,
    [idEstacionamiento, idAdmin, estado, motivo, enviadoEn],
  );

  if (!rows[0]) {
    const { rows: existe } = await query(
      'SELECT estado_aprobacion FROM estacionamiento WHERE id_estacionamiento = $1',
      [idEstacionamiento],
    );
    if (!existe[0]) throw ApiError.notFound('Estacionamiento no encontrado');
    if (existe[0].estado_aprobacion !== ESTADOS_APROBACION.PENDIENTE) {
      throw ApiError.conflict('El estacionamiento no esta pendiente de revision');
    }
    throw ApiError.conflict('El propietario lo cambio mientras lo revisabas: volve a cargarlo antes de decidir');
  }

  return obtenerEstacionamiento(idEstacionamiento);
}

export function aprobar(idEstacionamiento, idAdmin, { enviado_en } = {}) {
  return decidir(idEstacionamiento, idAdmin, ESTADOS_APROBACION.APROBADO, null, enviado_en);
}

export function rechazar(idEstacionamiento, idAdmin, { motivo, enviado_en }) {
  return decidir(idEstacionamiento, idAdmin, ESTADOS_APROBACION.RECHAZADO, motivo, enviado_en);
}
