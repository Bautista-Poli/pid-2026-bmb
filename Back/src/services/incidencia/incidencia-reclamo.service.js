// Reclamos del conductor sobre una reserva o un abono suyo: abrir, aceptar la
// propuesta de devolucion del propietario o retirarlo.
import { withTransaction } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { HOY_LOCAL_SQL } from '../../utils/horario.js';
import { ESTADOS_RESERVA, ROLES } from '../../utils/roles.js';
import { asegurarDentroDelTope, crearDevolucion } from '../devolucion.service.js';
import {
  DIAS_PARA_RECLAMAR,
  ESTADOS_INCIDENCIA,
  SISTEMA,
  TIPOS_INCIDENCIA,
  agregarMensaje,
  asegurarNoCerrada,
  bloquearObjeto,
  objetoDe,
} from './incidencia-comun.js';
import { buscarParticipando, obtener } from './incidencia.service.js';

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
      'UPDATE incidencia SET estado = $1, retirada_at = now() WHERE id_incidencia = $2',
      [ESTADOS_INCIDENCIA.RETIRADA, idIncidencia],
    );
  });
  return obtener(usuario, idIncidencia);
}

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
    `SELECT id_conductor, id_estacionamiento, hasta < ${HOY_LOCAL_SQL} - $2::int AS vencido
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
