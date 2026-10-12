// Moderacion del administrador de plataforma sobre las incidencias
// denunciadas (de cualquier tipo): ve los tres chats, escribe en los privados
// con cada parte y la resuelve. A favor del conductor, con una devolucion
// (simulada) que se aplica en el acto; a favor del propietario, sin devolucion.
import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../utils/roles.js';
import { crearDevolucion } from './devolucion.service.js';
import {
  CANALES,
  ESTADOS_INCIDENCIA,
  SELECT_INCIDENCIA,
  agregarMensaje,
  bloquearObjeto,
  conMontos,
  objetoDe,
} from './incidencia.service.js';

export const RESOLUCIONES = Object.freeze({
  A_FAVOR_CONDUCTOR: 'A_FAVOR_CONDUCTOR',
  A_FAVOR_PROPIETARIO: 'A_FAVOR_PROPIETARIO',
});

/** La cola: por defecto las denunciadas, la que espera hace mas primero. */
export async function listar({ estado = ESTADOS_INCIDENCIA.DENUNCIADA } = {}) {
  const { rows } = await query(
    `${SELECT_INCIDENCIA} WHERE i.estado = $1
      ORDER BY i.denunciada_at ASC NULLS LAST, i.created_at ASC`,
    [estado],
  );
  return rows.map(conMontos);
}

async function buscar(ejecutor, idIncidencia, { bloquear = false } = {}) {
  const { rows } = await ejecutor.query(
    `${SELECT_INCIDENCIA} WHERE i.id_incidencia = $1 ${bloquear ? 'FOR NO KEY UPDATE OF i' : ''}`,
    [idIncidencia],
  );
  if (!rows[0]) throw ApiError.notFound('La incidencia no existe');
  return conMontos(rows[0]);
}

/** Lo que hace falta para decidir: horarios reales y cancelacion de la reserva, o el periodo del abono. */
async function resumenDe(incidencia) {
  if (incidencia.id_reserva) {
    const { rows } = await query(
      `SELECT inicio, fin, ingreso_real, egreso_real, estado::text AS estado_reserva,
              cancelada_por::text AS cancelada_por, cancelada_en, motivo_reasignacion
         FROM reserva WHERE id_reserva = $1`,
      [incidencia.id_reserva],
    );
    return rows[0];
  }
  const { rows } = await query(
    `SELECT desde::text AS desde, hasta::text AS hasta, turno::text AS turno, estado::text AS estado_abono
       FROM abono WHERE id_abono = $1`,
    [incidencia.id_abono],
  );
  return rows[0];
}

/** El detalle con los tres chats y el resumen. */
export async function obtener(idIncidencia) {
  const incidencia = await buscar({ query }, idIncidencia);
  const [{ rows: mensajes }, resumen] = await Promise.all([
    query(
      `SELECT m.id_mensaje, m.canal::text AS canal, m.rol_autor::text AS rol_autor, m.texto, m.created_at,
              m.monto_propuesto, u.nombre AS autor_nombre, u.apellido AS autor_apellido
         FROM incidencia_mensaje m
         LEFT JOIN usuario u ON u.id_usuario = m.id_autor
        WHERE m.id_incidencia = $1
        ORDER BY m.created_at, m.id_mensaje`,
      [idIncidencia],
    ),
    resumenDe(incidencia),
  ]);
  return {
    ...incidencia,
    canales: Object.values(CANALES),
    mensajes: mensajes.map((m) => ({
      ...m,
      monto_propuesto: m.monto_propuesto === null ? null : Number(m.monto_propuesto),
    })),
    resumen,
  };
}

function asegurarDenunciada(incidencia) {
  if (incidencia.estado !== ESTADOS_INCIDENCIA.DENUNCIADA) {
    throw ApiError.conflict('La moderacion interviene solo en incidencias denunciadas');
  }
}

/** Mensaje del admin en el chat privado con una de las partes (el general es de ellas). */
export async function escribir(admin, idIncidencia, { texto, canal }) {
  await withTransaction(async (client) => {
    asegurarDenunciada(await buscar(client, idIncidencia, { bloquear: true }));
    await agregarMensaje(client, idIncidencia, ROLES.ADMINISTRADOR, texto, admin.id, canal);
  });
  return obtener(idIncidencia);
}

/**
 * Cierra la disputa. El fundamento queda en el chat general, donde lo leen las
 * dos partes.
 */
export async function resolver(admin, idIncidencia, { resolucion, monto, fundamento }) {
  await withTransaction(async (client) => {
    const incidencia = await buscar(client, idIncidencia, { bloquear: true });
    asegurarDenunciada(incidencia);

    if (resolucion === RESOLUCIONES.A_FAVOR_CONDUCTOR) {
      await bloquearObjeto(client, incidencia);
      await crearDevolucion(client, {
        idIncidencia,
        ...objetoDe(incidencia),
        monto,
        aplicadaPor: ROLES.ADMINISTRADOR,
      });
    }
    await agregarMensaje(client, idIncidencia, ROLES.ADMINISTRADOR, fundamento, admin.id);
    await client.query(
      `UPDATE incidencia
          SET estado = $1, resuelta_at = now(), resuelta_por = $2, resolucion = $3
        WHERE id_incidencia = $4`,
      [ESTADOS_INCIDENCIA.RESUELTA, admin.id, resolucion, idIncidencia],
    );
  });
  return obtener(idIncidencia);
}
