// Incidencias: listado, detalle, chat por canales, resolver y denunciar.
// Ver el resumen de tipos y canales en incidencia-comun.js.
import { query, withTransaction } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { ROLES } from '../../utils/roles.js';
import { asegurarDentroDelTope } from '../devolucion.service.js';
import {
  CANALES,
  CONDUCTOR,
  ESTADOS_INCIDENCIA,
  SELECT_INCIDENCIA,
  SISTEMA,
  TIPOS_INCIDENCIA,
  aNumero,
  agregarMensaje,
  asegurarNoCerrada,
  conMontos,
  objetoDe,
} from './incidencia-comun.js';

/** Quien participa: el propietario del estacionamiento y el conductor de la reserva. */
function filtroParticipante(usuario, primerParametro) {
  if (usuario.rol === ROLES.PROPIETARIO) return `e.id_propietario = $${primerParametro}`;
  if (usuario.rol === ROLES.CONDUCTOR) return `${CONDUCTOR} = $${primerParametro}`;
  throw ApiError.forbidden('Tu perfil no tiene incidencias');
}

/**
 * Canales que ve cada parte: el general siempre, y su chat privado con la
 * moderacion una vez denunciada. El canal privado del otro, nunca.
 */
function canalesVisibles(usuario, incidencia) {
  const privado = usuario.rol === ROLES.PROPIETARIO ? CANALES.PROPIETARIO : CANALES.CONDUCTOR;
  return incidencia.denunciada_at ? [CANALES.GENERAL, privado] : [CANALES.GENERAL];
}

const ORDEN_ESTADO = `CASE i.estado WHEN 'ABIERTA' THEN 0 WHEN 'DENUNCIADA' THEN 1 ELSE 2 END`;

/** Canal privado de la parte con la moderacion. */
const canalPrivadoDe = (usuario) =>
  usuario.rol === ROLES.PROPIETARIO ? CANALES.PROPIETARIO : CANALES.CONDUCTOR;

/** Las incidencias que ve el usuario (las suyas), con el ultimo mensaje. */
export async function listar(usuario) {
  // Cantidad y ultimo mensaje solo de lo que la parte puede ver.
  const privado = canalPrivadoDe(usuario);
  const { rows } = await query(
    `SELECT x.*,
            (SELECT COUNT(*)::int FROM incidencia_mensaje m
              WHERE m.id_incidencia = x.id_incidencia AND m.canal IN ('GENERAL', $2)) AS cantidad_mensajes,
            (SELECT m.texto FROM incidencia_mensaje m
              WHERE m.id_incidencia = x.id_incidencia AND m.canal IN ('GENERAL', $2)
              ORDER BY m.created_at DESC LIMIT 1) AS ultimo_mensaje
       FROM (${SELECT_INCIDENCIA} WHERE ${filtroParticipante(usuario, 1)}) x
       JOIN incidencia i ON i.id_incidencia = x.id_incidencia
      ORDER BY ${ORDEN_ESTADO}, x.created_at DESC`,
    [usuario.id, privado],
  );
  return rows.map(conMontos);
}

/** La incidencia si el usuario participa; si no, 404 (no se revela que existe). */
export async function buscarParticipando(ejecutor, usuario, idIncidencia, { bloquear = false } = {}) {
  const { rows } = await ejecutor.query(
    `${SELECT_INCIDENCIA} WHERE i.id_incidencia = $1 AND ${filtroParticipante(usuario, 2)}
     ${bloquear ? 'FOR NO KEY UPDATE OF i' : ''}`,
    [idIncidencia, usuario.id],
  );
  if (!rows[0]) throw ApiError.notFound('La incidencia no existe');
  return conMontos(rows[0]);
}

/** La incidencia con los mensajes de los canales que ve el usuario. */
async function conMensajes(ejecutor, usuario, incidencia) {
  const canales = canalesVisibles(usuario, incidencia);
  const { rows } = await ejecutor.query(
    `SELECT m.id_mensaje, m.canal::text AS canal, m.rol_autor::text AS rol_autor, m.texto, m.created_at,
            m.monto_propuesto,
            u.nombre AS autor_nombre, u.apellido AS autor_apellido
       FROM incidencia_mensaje m
       LEFT JOIN usuario u ON u.id_usuario = m.id_autor
      WHERE m.id_incidencia = $1 AND m.canal = ANY($2::canal_incidencia[])
      ORDER BY m.created_at, m.id_mensaje`,
    [incidencia.id_incidencia, canales],
  );
  const { id_propietario: _propietario, ...publica } = incidencia;
  return {
    ...publica,
    cantidad_mensajes: rows.length,
    ultimo_mensaje: rows.at(-1)?.texto ?? null,
    canales,
    mensajes: rows.map((m) => ({ ...m, monto_propuesto: aNumero(m.monto_propuesto) })),
  };
}

/** El detalle de una incidencia con los chats que el usuario puede ver. */
export async function obtener(usuario, idIncidencia) {
  const incidencia = await buscarParticipando({ query }, usuario, idIncidencia);
  return conMensajes({ query }, usuario, incidencia);
}

/**
 * Escribe en un canal. En el GENERAL escriben propietario y conductor; en los
 * privados, cada parte solo en el suyo y solo despues de la denuncia.
 */
export async function responder(usuario, idIncidencia, { texto, canal = CANALES.GENERAL, monto_propuesto }) {
  const propone = monto_propuesto !== undefined && monto_propuesto !== null;
  if (propone && usuario.rol !== ROLES.PROPIETARIO) {
    throw ApiError.badRequest('Solo el estacionamiento propone devoluciones');
  }
  if (propone && canal !== CANALES.GENERAL) {
    throw ApiError.badRequest('La propuesta de devolucion va en el chat con el conductor');
  }
  await withTransaction(async (client) => {
    const incidencia = await buscarParticipando(client, usuario, idIncidencia, { bloquear: true });
    asegurarNoCerrada(incidencia);
    if (propone) {
      if (incidencia.tipo !== TIPOS_INCIDENCIA.RECLAMO || incidencia.estado !== ESTADOS_INCIDENCIA.ABIERTA) {
        throw ApiError.conflict('Solo se proponen devoluciones en un reclamo abierto');
      }
      await asegurarDentroDelTope(client, objetoDe(incidencia), monto_propuesto, 'La propuesta');
    }
    if (canal !== CANALES.GENERAL) {
      if (canal !== canalPrivadoDe(usuario)) throw ApiError.forbidden('No participas de ese chat');
      if (!incidencia.denunciada_at) {
        throw ApiError.conflict('El chat con la moderacion se abre cuando alguien denuncia la incidencia');
      }
    }
    await agregarMensaje(client, idIncidencia, usuario.rol, texto, usuario.id, canal, propone ? monto_propuesto : null);
  });
  return obtener(usuario, idIncidencia);
}

/** El propietario la da por cerrada, con un comentario opcional para el conductor. */
export async function resolver(usuario, idIncidencia, { comentario } = {}) {
  await withTransaction(async (client) => {
    const incidencia = await buscarParticipando(client, usuario, idIncidencia, { bloquear: true });
    asegurarNoCerrada(incidencia);
    if (incidencia.tipo === TIPOS_INCIDENCIA.RECLAMO) {
      throw ApiError.conflict('Un reclamo lo cierra el conductor aceptando tu propuesta, o la moderación');
    }
    if (incidencia.estado === ESTADOS_INCIDENCIA.DENUNCIADA) {
      throw ApiError.conflict('La incidencia esta denunciada: la cierra la moderacion');
    }
    if (comentario) await agregarMensaje(client, idIncidencia, usuario.rol, comentario, usuario.id);
    await agregarMensaje(client, idIncidencia, SISTEMA, 'El propietario marco la incidencia como resuelta.');
    await client.query(
      `UPDATE incidencia SET estado = $1, resuelta_at = now() WHERE id_incidencia = $2`,
      [ESTADOS_INCIDENCIA.RESUELTA, idIncidencia],
    );
  });
  return obtener(usuario, idIncidencia);
}

/**
 * Propietario o conductor la escalan a la moderacion (no hubo acuerdo). Se
 * abren los dos chats privados: el motivo va al de quien denuncia, y en el
 * general solo queda el aviso, sin quien ni por que.
 */
export async function denunciar(usuario, idIncidencia, { motivo }) {
  await withTransaction(async (client) => {
    const incidencia = await buscarParticipando(client, usuario, idIncidencia, { bloquear: true });
    asegurarNoCerrada(incidencia);
    if (incidencia.estado === ESTADOS_INCIDENCIA.DENUNCIADA) {
      throw ApiError.conflict('La incidencia ya fue denunciada');
    }

    const propio = canalPrivadoDe(usuario);
    const otro = propio === CANALES.PROPIETARIO ? CANALES.CONDUCTOR : CANALES.PROPIETARIO;
    await agregarMensaje(
      client, idIncidencia, SISTEMA,
      'Denunciaste la incidencia. Un moderador de Parkit la va a revisar y te va a escribir por aca.',
      null, propio,
    );
    await agregarMensaje(client, idIncidencia, usuario.rol, motivo, usuario.id, propio);
    await agregarMensaje(
      client, idIncidencia, SISTEMA,
      'La incidencia se escalo a la moderacion de Parkit. Un moderador te va a escribir por aca.',
      null, otro,
    );
    await agregarMensaje(
      client, idIncidencia, SISTEMA,
      'La incidencia se escalo a la moderacion de Parkit. Pueden seguir hablando por aca; la moderacion puede leer esta conversacion.',
    );
    await client.query(
      `UPDATE incidencia SET estado = $1, denunciada_at = now(), denunciada_por = $2 WHERE id_incidencia = $3`,
      [ESTADOS_INCIDENCIA.DENUNCIADA, usuario.rol, idIncidencia],
    );
  });
  return obtener(usuario, idIncidencia);
}
