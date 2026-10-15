// Incidencias: problemas de una reserva que el propietario tiene que ver, con
// tres chats (canales):
//   - GENERAL: propietario y conductor lo arreglan entre ellos. La moderacion
//     de la plataforma lo puede leer pero no escribe.
//   - PROPIETARIO y CONDUCTOR: chat privado de la moderacion con cada parte.
//     Aparecen recien cuando alguno de los dos denuncia (no hubo acuerdo).
//
// Las crea el sistema (src/jobs/vencimientos.job.js):
//   - AUTO_EXCEDIDO: una ACTIVA paso su `fin` (mas MARGEN_EXCESO_MS) sin
//     egreso. La cochera ya estaba bloqueada desde el `fin` (ver finEfectivo en
//     utils/solapamiento.js); la incidencia es el aviso al propietario.
//   - RESERVA_AFECTADA: la reserva siguiente de esa cochera esta por empezar,
//     el auto sigue adentro y no hay otra cochera libre para reasignarla.
//
// Mientras esta ABIERTA, el propietario la marca RESUELTA. Cualquiera de los
// dos la puede DENUNCIAR: desde ahi la cierra la moderacion.
//
// RECLAMO: lo abre el conductor sobre una reserva o un abono suyo. El
// propietario no lo cierra: propone una devolucion en el hilo y el conductor
// la acepta (o lo retira); si no se ponen de acuerdo, se denuncia.
import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ESTADOS_RESERVA, ROLES } from '../utils/roles.js';
import { buscarAlternativa } from './cochera.service.js';
import { PAGADO_RESERVA, asegurarDentroDelTope, crearDevolucion } from './devolucion.service.js';

export const TIPOS_INCIDENCIA = Object.freeze({
  AUTO_EXCEDIDO: 'AUTO_EXCEDIDO',
  RESERVA_AFECTADA: 'RESERVA_AFECTADA',
  // Lo abre el conductor sobre una reserva o un abono suyo.
  RECLAMO: 'RECLAMO',
});

export const MOTIVOS_RECLAMO = Object.freeze([
  'NO_HABIA_COCHERA',
  'COBRO_INCORRECTO',
  'DANO_AL_VEHICULO',
  'MAL_SERVICIO',
  'OTRO',
]);

// Pasado este plazo desde el fin de la reserva (o del abono) ya no se reclama.
export const DIAS_PARA_RECLAMAR = 15;

export const CANALES = Object.freeze({
  GENERAL: 'GENERAL',
  PROPIETARIO: 'PROPIETARIO',
  CONDUCTOR: 'CONDUCTOR',
});

export const ESTADOS_INCIDENCIA = Object.freeze({
  ABIERTA: 'ABIERTA',
  DENUNCIADA: 'DENUNCIADA',
  RESUELTA: 'RESUELTA',
  // El conductor retiro su reclamo.
  RETIRADA: 'RETIRADA',
});

const SISTEMA = 'SISTEMA';

// Unos minutos de gracia antes de avisar: salir 2 minutos tarde no es un problema.
export const MARGEN_EXCESO_MS = 15 * 60 * 1000;

// La reserva siguiente se protege cuando ya puede ingresar (30 min antes de su
// inicio, igual que MARGEN_INGRESO_MS en reserva.service.js).
const ANTICIPACION_REASIGNACION_MS = 30 * 60 * 1000;

const HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const AVISO_REASIGNADA_POR_EXCESO =
  'Te reasignamos a otra cochera: la tuya sigue ocupada por el vehiculo anterior.';
export const AVISO_AFECTADA_POR_EXCESO =
  'Tu cochera sigue ocupada por el vehiculo anterior y no habia otra libre. ' +
  'El estacionamiento te va a indicar donde estacionar.';

export async function agregarMensaje(
  ejecutor, idIncidencia, rolAutor, texto, idAutor = null, canal = CANALES.GENERAL, montoPropuesto = null,
) {
  await ejecutor.query(
    `INSERT INTO incidencia_mensaje (id_incidencia, id_autor, rol_autor, texto, canal, monto_propuesto)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [idIncidencia, idAutor, rolAutor, texto, canal, montoPropuesto],
  );
}

/** Crea la incidencia si no existia (una por tipo y reserva). Devuelve su id, o null si ya estaba. */
async function crearIncidencia(client, { tipo, idReserva, idEstacionamiento, mensaje }) {
  const { rows } = await client.query(
    `INSERT INTO incidencia (tipo, id_reserva, id_estacionamiento)
     VALUES ($1, $2, $3)
     ON CONFLICT (id_reserva, tipo) WHERE abierta_por IS NULL DO NOTHING
     RETURNING id_incidencia`,
    [tipo, idReserva, idEstacionamiento],
  );
  if (!rows[0]) return null;
  await agregarMensaje(client, rows[0].id_incidencia, SISTEMA, mensaje);
  return rows[0].id_incidencia;
}

/* ------------------------------ job ----------------------------------- */

/** ACTIVA que paso su fin (mas el margen) y sigue sin egreso: incidencia AUTO_EXCEDIDO. */
export async function detectarExcedidos() {
  const { rows } = await query(
    `SELECT r.id_reserva, r.fin, v.patente, c.identificador AS cochera, c.id_estacionamiento
       FROM reserva r
       JOIN vehiculo v ON v.id_vehiculo = r.id_vehiculo
       JOIN cochera c  ON c.id_cochera = r.id_cochera
      WHERE r.estado = $1
        AND r.fin <= now() - make_interval(secs => $2::float / 1000)
        AND NOT EXISTS (
          SELECT 1 FROM incidencia i WHERE i.id_reserva = r.id_reserva AND i.tipo = $3
        )`,
    [ESTADOS_RESERVA.ACTIVA, MARGEN_EXCESO_MS, TIPOS_INCIDENCIA.AUTO_EXCEDIDO],
  );

  let creadas = 0;
  for (const r of rows) {
    const id = await withTransaction((client) =>
      crearIncidencia(client, {
        tipo: TIPOS_INCIDENCIA.AUTO_EXCEDIDO,
        idReserva: r.id_reserva,
        idEstacionamiento: r.id_estacionamiento,
        mensaje:
          `El vehiculo ${r.patente} tenia que salir de la cochera ${r.cochera} a las ` +
          `${HORA.format(r.fin)} y sigue adentro. La cochera queda bloqueada hasta que se registre el egreso.`,
      }),
    );
    if (id) creadas += 1;
  }
  return creadas;
}

/**
 * Reservas que estan por empezar (o ya empezaron) en una cochera donde sigue un
 * auto excedido: se reasignan a otra cochera libre del mismo estacionamiento y
 * tipo; si no hay, quedan donde estan con un aviso para el conductor y una
 * incidencia RESERVA_AFECTADA para el propietario.
 */
export async function protegerReservasSiguientes() {
  const { rows } = await query(
    `SELECT r.id_reserva
       FROM reserva r
      WHERE r.estado IN ($1, $2)
        AND r.inicio <= now() + make_interval(secs => $3::float / 1000)
        AND r.fin > now()
        AND EXISTS (
          SELECT 1 FROM reserva x
           WHERE x.id_cochera = r.id_cochera
             AND x.id_reserva <> r.id_reserva
             AND x.estado = $4
             AND x.fin <= now()
        )
        AND NOT EXISTS (
          SELECT 1 FROM incidencia i WHERE i.id_reserva = r.id_reserva AND i.tipo = $5
        )`,
    [
      ESTADOS_RESERVA.PENDIENTE,
      ESTADOS_RESERVA.CONFIRMADA,
      ANTICIPACION_REASIGNACION_MS,
      ESTADOS_RESERVA.ACTIVA,
      TIPOS_INCIDENCIA.RESERVA_AFECTADA,
    ],
  );

  const resultado = { reasignadas: 0, afectadas: 0 };
  for (const { id_reserva } of rows) {
    const accion = await withTransaction(async (client) => {
      const { rows: filas } = await client.query(
        `SELECT r.id_reserva, r.inicio, r.fin, r.id_cochera, r.estado,
                c.id_estacionamiento, c.identificador AS cochera, v.id_tipo_vehiculo, v.patente
           FROM reserva r
           JOIN cochera c  ON c.id_cochera = r.id_cochera
           JOIN vehiculo v ON v.id_vehiculo = r.id_vehiculo
          WHERE r.id_reserva = $1 AND r.estado IN ($2, $3)
          FOR UPDATE OF r`,
        [id_reserva, ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA],
      );
      const reserva = filas[0];
      if (!reserva) return null;

      const alternativa = await buscarAlternativa(
        client,
        reserva.id_estacionamiento,
        reserva.id_cochera,
        reserva.id_tipo_vehiculo,
        reserva.inicio,
        reserva.fin,
      );
      if (alternativa) {
        await client.query(
          'UPDATE reserva SET id_cochera = $1, motivo_reasignacion = $2 WHERE id_reserva = $3',
          [alternativa, AVISO_REASIGNADA_POR_EXCESO, reserva.id_reserva],
        );
        return 'reasignadas';
      }

      await client.query('UPDATE reserva SET motivo_reasignacion = $1 WHERE id_reserva = $2', [
        AVISO_AFECTADA_POR_EXCESO,
        reserva.id_reserva,
      ]);
      await crearIncidencia(client, {
        tipo: TIPOS_INCIDENCIA.RESERVA_AFECTADA,
        idReserva: reserva.id_reserva,
        idEstacionamiento: reserva.id_estacionamiento,
        mensaje:
          `La reserva de ${reserva.patente} (${HORA.format(reserva.inicio)} a ${HORA.format(reserva.fin)}) ` +
          `no se pudo reasignar: la cochera ${reserva.cochera} sigue ocupada por el vehiculo anterior ` +
          'y no hay otra libre en ese horario.',
      });
      return 'afectadas';
    });
    if (accion) resultado[accion] += 1;
  }
  return resultado;
}

/**
 * Lo llama el egreso de reserva.service.js: si el auto se habia excedido, se
 * deja constancia en su incidencia (que sigue abierta hasta que el propietario
 * la resuelva).
 */
export async function registrarEgresoEnIncidencia(client, idReserva, egreso = new Date()) {
  const { rows } = await client.query(
    `SELECT i.id_incidencia, r.fin
       FROM incidencia i JOIN reserva r ON r.id_reserva = i.id_reserva
      WHERE i.id_reserva = $1 AND i.tipo = $2`,
    [idReserva, TIPOS_INCIDENCIA.AUTO_EXCEDIDO],
  );
  if (!rows[0]) return;
  const minutos = Math.max(0, Math.round((egreso.getTime() - rows[0].fin.getTime()) / 60_000));
  await agregarMensaje(
    client,
    rows[0].id_incidencia,
    SISTEMA,
    `El vehiculo egreso a las ${HORA.format(egreso)}, ${minutos} min despues de su horario. La cochera quedo libre.`,
  );
}

/* ------------------------------ API ----------------------------------- */

// Una incidencia es sobre una reserva o (solo los reclamos) sobre un abono: el
// conductor es el de cualquiera de los dos. Los montos salen como texto de pg
// y se pasan a numero en `conMontos`.
const CONDUCTOR = 'COALESCE(r.id_conductor, a.id_conductor)';

export const SELECT_INCIDENCIA = `
  SELECT i.id_incidencia, i.tipo::text AS tipo, i.estado::text AS estado,
         i.created_at, i.denunciada_at, i.resuelta_at, i.denunciada_por::text AS denunciada_por,
         i.id_reserva, r.inicio, r.fin, r.estado::text AS estado_reserva, r.egreso_real,
         i.id_abono, a.desde::text AS abono_desde, a.hasta::text AS abono_hasta, a.turno::text AS abono_turno,
         ${CONDUCTOR} AS id_conductor, u.nombre AS conductor_nombre, u.apellido AS conductor_apellido,
         v.patente, c.identificador AS cochera,
         e.id_estacionamiento, e.nombre AS estacionamiento, e.id_propietario,
         i.motivo::text AS motivo, i.monto_pedido, i.resolucion::text AS resolucion,
         COALESCE(${PAGADO_RESERVA}, a.precio_total) AS pagado,
         CASE WHEN i.id_reserva IS NOT NULL
              THEN (SELECT COALESCE(SUM(d.monto), 0) FROM devolucion d WHERE d.id_reserva = i.id_reserva)
              ELSE (SELECT COALESCE(SUM(d.monto), 0) FROM devolucion d WHERE d.id_abono = i.id_abono)
         END AS devuelto,
         (SELECT m.monto_propuesto FROM incidencia_mensaje m
           WHERE m.id_incidencia = i.id_incidencia AND m.monto_propuesto IS NOT NULL
           ORDER BY m.created_at DESC, m.id_mensaje DESC LIMIT 1) AS propuesta_vigente
    FROM incidencia i
    LEFT JOIN reserva r    ON r.id_reserva = i.id_reserva
    LEFT JOIN abono a      ON a.id_abono = i.id_abono
    JOIN usuario u         ON u.id_usuario = ${CONDUCTOR}
    LEFT JOIN vehiculo v   ON v.id_vehiculo = r.id_vehiculo
    LEFT JOIN cochera c    ON c.id_cochera = r.id_cochera
    JOIN estacionamiento e ON e.id_estacionamiento = i.id_estacionamiento
`;

const aNumero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/** Montos como numeros y el tope (lo pagado menos lo ya devuelto). */
export function conMontos(fila) {
  const pagado = aNumero(fila.pagado) ?? 0;
  const devuelto = aNumero(fila.devuelto) ?? 0;
  return {
    ...fila,
    monto_pedido: aNumero(fila.monto_pedido),
    propuesta_vigente: aNumero(fila.propuesta_vigente),
    pagado,
    devuelto,
    tope: Math.round(Math.max(0, pagado - devuelto) * 100) / 100,
  };
}

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
async function buscarParticipando(ejecutor, usuario, idIncidencia, { bloquear = false } = {}) {
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

/* ----------------------------- reclamos ------------------------------- */

/** RESUELTA y RETIRADA son finales: el hilo queda de solo lectura. */
export function asegurarNoCerrada(incidencia) {
  if (incidencia.estado === ESTADOS_INCIDENCIA.RESUELTA) throw ApiError.conflict('La incidencia ya esta resuelta');
  if (incidencia.estado === ESTADOS_INCIDENCIA.RETIRADA) throw ApiError.conflict('El reclamo fue retirado');
}

/** La reserva o el abono de la incidencia, como lo piden las devoluciones. */
export const objetoDe = (incidencia) => ({ idReserva: incidencia.id_reserva, idAbono: incidencia.id_abono });

/** Bloquea la reserva o el abono: dos devoluciones a la vez no pasan el tope. */
export async function bloquearObjeto(client, incidencia) {
  if (incidencia.id_reserva) {
    await client.query('SELECT 1 FROM reserva WHERE id_reserva = $1 FOR UPDATE', [incidencia.id_reserva]);
  } else {
    await client.query('SELECT 1 FROM abono WHERE id_abono = $1 FOR UPDATE', [incidencia.id_abono]);
  }
}

/** La ultima propuesta, leida despues de bloquear la incidencia. */
async function propuestaVigente(client, idIncidencia) {
  const { rows } = await client.query(
    `SELECT monto_propuesto FROM incidencia_mensaje
      WHERE id_incidencia = $1 AND monto_propuesto IS NOT NULL
      ORDER BY created_at DESC, id_mensaje DESC LIMIT 1`,
    [idIncidencia],
  );
  return rows[0] ? Number(rows[0].monto_propuesto) : null;
}

/** Reclamo del conductor que todavia se puede aceptar o retirar. */
async function reclamoEnCurso(client, usuario, idIncidencia) {
  const incidencia = await buscarParticipando(client, usuario, idIncidencia, { bloquear: true });
  if (incidencia.tipo !== TIPOS_INCIDENCIA.RECLAMO) throw ApiError.conflict('Esta incidencia no es un reclamo');
  asegurarNoCerrada(incidencia);
  if (incidencia.estado === ESTADOS_INCIDENCIA.DENUNCIADA) {
    throw ApiError.conflict('El reclamo esta denunciado: lo resuelve la moderacion');
  }
  return incidencia;
}

const PESOS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/**
 * El conductor acepta la ultima propuesta del propietario. Manda el monto que
 * vio: si el propietario la cambio mientras tanto, 409 (no se acepta otro numero).
 */
export async function aceptar(usuario, idIncidencia, { monto }) {
  await withTransaction(async (client) => {
    const incidencia = await reclamoEnCurso(client, usuario, idIncidencia);
    const vigente = await propuestaVigente(client, idIncidencia);
    if (vigente === null) throw ApiError.conflict('El propietario todavia no propuso una devolucion');
    if (vigente !== monto) throw ApiError.conflict('El propietario cambió la propuesta');

    await bloquearObjeto(client, incidencia);
    if (vigente > 0) {
      await crearDevolucion(client, {
        idIncidencia,
        ...objetoDe(incidencia),
        monto: vigente,
        aplicadaPor: ROLES.PROPIETARIO,
      });
    }
    await agregarMensaje(
      client, idIncidencia, SISTEMA,
      vigente > 0
        ? `El conductor acepto la propuesta: se devolvieron $${PESOS.format(vigente)}.`
        : 'El conductor acepto la propuesta, sin devolucion.',
    );
    await client.query(
      'UPDATE incidencia SET estado = $1, resuelta_at = now() WHERE id_incidencia = $2',
      [ESTADOS_INCIDENCIA.RESUELTA, idIncidencia],
    );
  });
  return obtener(usuario, idIncidencia);
}

/** El conductor retira su reclamo. */
export async function retirar(usuario, idIncidencia) {
  await withTransaction(async (client) => {
    await reclamoEnCurso(client, usuario, idIncidencia);
    await agregarMensaje(client, idIncidencia, SISTEMA, 'El conductor retiro el reclamo.');
    await client.query(
      'UPDATE incidencia SET estado = $1, resuelta_at = now() WHERE id_incidencia = $2',
      [ESTADOS_INCIDENCIA.RETIRADA, idIncidencia],
    );
  });
  return obtener(usuario, idIncidencia);
}

const HOY_LOCAL = `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;
const ESTADOS_RECLAMABLES = [
  ESTADOS_RESERVA.CONFIRMADA,
  ESTADOS_RESERVA.ACTIVA,
  ESTADOS_RESERVA.FINALIZADA,
  ESTADOS_RESERVA.CANCELADA,
];
const FUERA_DE_PLAZO = 'Pasaron más de 15 días; ya no se puede reclamar';

/** La reserva o el abono del conductor, bloqueado; 404 si no es suyo. */
async function objetoReclamado(client, idConductor, { id_reserva: idReserva, id_abono: idAbono }) {
  if (idReserva) {
    const { rows } = await client.query(
      `SELECT r.id_conductor, r.estado::text AS estado, r.id_abono, c.id_estacionamiento,
              r.fin < now() - make_interval(days => $2) AS vencida
         FROM reserva r JOIN cochera c ON c.id_cochera = r.id_cochera
        WHERE r.id_reserva = $1
        FOR UPDATE OF r`,
      [idReserva, DIAS_PARA_RECLAMAR],
    );
    const reserva = rows[0];
    if (!reserva || reserva.id_conductor !== idConductor) throw ApiError.notFound('La reserva no existe');
    if (reserva.id_abono) {
      throw ApiError.conflict('Esta reserva es parte de un abono; hacé el reclamo sobre el abono');
    }
    if (!ESTADOS_RECLAMABLES.includes(reserva.estado)) {
      throw ApiError.conflict('Esta reserva no se puede reclamar');
    }
    if (reserva.vencida) throw ApiError.conflict(FUERA_DE_PLAZO);
    return { idReserva, idAbono: null, idEstacionamiento: reserva.id_estacionamiento };
  }

  const { rows } = await client.query(
    `SELECT id_conductor, id_estacionamiento, hasta < ${HOY_LOCAL} - $2::int AS vencido
       FROM abono WHERE id_abono = $1
       FOR UPDATE`,
    [idAbono, DIAS_PARA_RECLAMAR],
  );
  const abono = rows[0];
  if (!abono || abono.id_conductor !== idConductor) throw ApiError.notFound('El abono no existe');
  if (abono.vencido) throw ApiError.conflict(FUERA_DE_PLAZO);
  return { idReserva: null, idAbono, idEstacionamiento: abono.id_estacionamiento };
}

/** El conductor abre un reclamo; la descripcion es el primer mensaje del hilo. */
export async function abrirReclamo(usuario, datos) {
  const idIncidencia = await withTransaction(async (client) => {
    const objeto = await objetoReclamado(client, usuario.id, datos);
    if (datos.monto_pedido !== undefined) {
      await asegurarDentroDelTope(client, objeto, datos.monto_pedido, 'El monto pedido');
    }

    let rows;
    try {
      ({ rows } = await client.query(
        `INSERT INTO incidencia (tipo, id_reserva, id_abono, id_estacionamiento, abierta_por, motivo, monto_pedido)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_incidencia`,
        [
          TIPOS_INCIDENCIA.RECLAMO,
          objeto.idReserva,
          objeto.idAbono,
          objeto.idEstacionamiento,
          usuario.id,
          datos.motivo,
          datos.monto_pedido ?? null,
        ],
      ));
    } catch (error) {
      if (error.code === '23505') throw ApiError.conflict('Ya tenés un reclamo abierto sobre esto');
      throw error;
    }
    await agregarMensaje(client, rows[0].id_incidencia, usuario.rol, datos.texto, usuario.id);
    return rows[0].id_incidencia;
  });
  return obtener(usuario, idIncidencia);
}
