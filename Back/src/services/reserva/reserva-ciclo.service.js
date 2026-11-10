// Ciclo de la reserva del lado del propietario: confirmar, marcar ausente y el
// ingreso/egreso por codigo (ver el diagrama en reserva-estados.js).
import { query, withTransaction } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { normalizarCodigo } from '../../utils/codigoAcceso.js';
import { HORA_LOCAL } from '../../utils/horario.js';
import { ESTADOS_RESERVA } from '../../utils/roles.js';
import { registrarEgresoEnIncidencia } from '../incidencia/incidencia-vencimientos.service.js';
import { obtenerDetalle } from './reserva-detalle.js';
import {
  MARGEN_INGRESO_MS,
  MENSAJE_NO_SHOW,
  MENSAJE_TOLERANCIA,
  cambiarEstado,
  limiteIngreso,
} from './reserva-estados.js';

/** Bloquea la reserva y verifica que la cochera sea de un estacionamiento propio. */
async function bloquearReservaDelPropietario(client, idReserva, idPropietario) {
  const { rows } = await client.query(
    `SELECT r.id_reserva, r.estado, r.inicio, r.fin, r.ingreso_real, r.egreso_real,
            r.id_cochera, e.id_propietario
       FROM reserva r
       JOIN cochera c         ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE r.id_reserva = $1
      FOR UPDATE OF r`,
    [idReserva],
  );

  const reserva = rows[0];
  if (!reserva) throw ApiError.notFound('La reserva no existe');
  if (reserva.id_propietario !== idPropietario) {
    throw ApiError.forbidden('La reserva es de otro estacionamiento');
  }
  return reserva;
}

/** El propietario acepta una reserva pendiente. */
export async function confirmar(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);

    if (reserva.fin <= new Date()) throw ApiError.conflict('La reserva ya termino');
    // Sin confirmar al empezar ya es Expirada, aunque la revision de vencimientos no la haya cancelado.
    if (reserva.estado === ESTADOS_RESERVA.PENDIENTE && reserva.inicio <= new Date()) {
      throw ApiError.conflict('La reserva empezo sin confirmar: quedo expirada');
    }

    await cambiarEstado(client, reserva, ESTADOS_RESERVA.CONFIRMADA);

    return obtenerDetalle(client, idReserva);
  });
}

/**
 * El propietario marca a mano que el conductor no va a venir (p. ej. avisó),
 * sin esperar a que venza la tolerancia. Solo sobre una CONFIRMADA sin
 * ingreso y desde su `inicio`: antes todavía puede llegar, y si no viene lo
 * que corresponde es que el conductor cancele. Libera la cochera igual que el
 * no-show automatico.
 */
export async function marcarAusente(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);

    if (reserva.estado !== ESTADOS_RESERVA.CONFIRMADA) {
      throw ApiError.conflict('Solo se marca ausente una reserva confirmada sin ingreso');
    }
    if (Date.now() < reserva.inicio.getTime()) {
      throw ApiError.conflict(
        `La reserva empieza a las ${HORA_LOCAL.format(reserva.inicio)}; recien desde entonces se puede marcar ausente`,
      );
    }

    await cambiarEstado(client, reserva, ESTADOS_RESERVA.NO_SHOW);
    return obtenerDetalle(client, idReserva);
  });
}

/**
 * Un egreso pegado al ingreso es casi seguro un doble escaneo del QR (o una
 * recarga de la pantalla), no un auto que entro y salio: se rechaza.
 */
const MARGEN_EGRESO_TRAS_INGRESO_MS = 60 * 1000;

/** Reglas del ingreso sobre una reserva ya bloqueada (las usa registrarAcceso). */
async function aplicarIngreso(client, reserva) {
  if (reserva.estado === ESTADOS_RESERVA.PENDIENTE) {
    throw ApiError.conflict('Primero hay que confirmar la reserva');
  }
  if (reserva.ingreso_real) throw ApiError.conflict('El ingreso ya estaba registrado');

  const ahora = Date.now();
  if (ahora < reserva.inicio.getTime() - MARGEN_INGRESO_MS) {
    throw ApiError.conflict('Todavia es muy temprano para registrar el ingreso');
  }
  if (ahora > reserva.fin.getTime()) throw ApiError.conflict('La franja de la reserva ya termino');
  // Mismo corte que la revision de vencimientos: pasada la tolerancia la reserva
  // es un no-show, aunque todavia no la haya marcado (corre al llegar pedidos).
  if (ahora > limiteIngreso(reserva)) throw ApiError.conflict(MENSAJE_TOLERANCIA);

  // Un auto excedido sigue en la cochera: no entra otro hasta su egreso.
  const { rows: ocupada } = await client.query(
    `SELECT 1 FROM reserva WHERE id_cochera = $1 AND estado = $2 AND id_reserva <> $3 LIMIT 1`,
    [reserva.id_cochera, ESTADOS_RESERVA.ACTIVA, reserva.id_reserva],
  );
  if (ocupada[0]) {
    throw ApiError.conflict('La cochera sigue ocupada por el vehiculo anterior: espera su egreso');
  }

  await client.query('UPDATE reserva SET ingreso_real = now() WHERE id_reserva = $1', [reserva.id_reserva]);
  await cambiarEstado(client, reserva, ESTADOS_RESERVA.ACTIVA);
}

/** Reglas del egreso sobre una reserva ya bloqueada (las usa registrarAcceso). */
async function aplicarEgreso(client, reserva) {
  if (!reserva.ingreso_real) throw ApiError.conflict('La reserva todavia no tiene ingreso');
  if (reserva.egreso_real) throw ApiError.conflict('El egreso ya estaba registrado');

  await client.query('UPDATE reserva SET egreso_real = now() WHERE id_reserva = $1', [reserva.id_reserva]);
  await cambiarEstado(client, reserva, ESTADOS_RESERVA.FINALIZADA);
  // Si se habia excedido, queda constancia en su incidencia.
  await registrarEgresoEnIncidencia(client, reserva.id_reserva);
}

/* ----------------------- ingreso y egreso por codigo -----------------------
   El conductor muestra el QR de su reserva al entrar y al salir; el operador
   (hoy, el propietario) lo escanea o tipea el codigo. El mismo codigo sirve
   para las dos cosas: el estado de la reserva decide que se registra.
-------------------------------------------------------------------------- */

const ACCIONES_ACCESO = Object.freeze({ INGRESO: 'INGRESO', EGRESO: 'EGRESO' });

/** Mismo mensaje para un codigo inexistente, mal formado o de un estacionamiento ajeno. */
const CODIGO_INVALIDO = 'El codigo no corresponde a ninguna reserva de tus estacionamientos';

/** La reserva de ese codigo en un estacionamiento del propietario; 404 si no. */
async function buscarReservaPorCodigo(ejecutor, idPropietario, bruto, { bloquear = false } = {}) {
  const codigo = normalizarCodigo(bruto);
  if (!codigo) throw ApiError.notFound(CODIGO_INVALIDO);

  const { rows } = await ejecutor.query(
    `SELECT r.id_reserva, r.estado, r.inicio, r.fin, r.ingreso_real, r.egreso_real, r.id_cochera
       FROM reserva r
       JOIN cochera c         ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE r.codigo_acceso = $1 AND e.id_propietario = $2
      ${bloquear ? 'FOR UPDATE OF r' : ''}`,
    [codigo, idPropietario],
  );
  if (!rows[0]) throw ApiError.notFound(CODIGO_INVALIDO);
  return rows[0];
}

/**
 * Que se registra ahora sobre esta reserva. Una ACTIVA da egreso aunque su
 * `fin` haya pasado (el auto sigue adentro); el resto explica por que no.
 */
function accionPara(reserva, ahora = Date.now()) {
  switch (reserva.estado) {
    case ESTADOS_RESERVA.ACTIVA:
      return ACCIONES_ACCESO.EGRESO;
    case ESTADOS_RESERVA.CONFIRMADA: {
      const desde = new Date(reserva.inicio.getTime() - MARGEN_INGRESO_MS);
      if (ahora < desde.getTime()) {
        throw ApiError.conflict(
          `La reserva empieza a las ${HORA_LOCAL.format(reserva.inicio)}; ` +
            `se puede ingresar desde las ${HORA_LOCAL.format(desde)}`,
        );
      }
      if (ahora > reserva.fin.getTime()) throw ApiError.conflict('La franja de la reserva ya termino');
      if (ahora > limiteIngreso(reserva)) throw ApiError.conflict(MENSAJE_TOLERANCIA);
      return ACCIONES_ACCESO.INGRESO;
    }
    case ESTADOS_RESERVA.PENDIENTE:
      throw ApiError.conflict('La reserva todavia no esta confirmada');
    case ESTADOS_RESERVA.CANCELADA:
      throw ApiError.conflict('La reserva esta cancelada');
    case ESTADOS_RESERVA.NO_SHOW:
      throw ApiError.conflict(MENSAJE_NO_SHOW);
    default:
      throw ApiError.conflict('La reserva ya termino');
  }
}

/** Vista previa para la pantalla de confirmacion del operador: no registra nada. */
export async function previaAcceso(idPropietario, codigo) {
  const reserva = await buscarReservaPorCodigo({ query }, idPropietario, codigo);
  const accion = accionPara(reserva);
  return { accion, reserva: await obtenerDetalle({ query }, reserva.id_reserva, { conCodigo: true }) };
}

/**
 * Registra el ingreso o el egreso. Vuelve a resolver la accion con la reserva
 * bloqueada: entre la vista previa y la confirmacion puede haber cambiado.
 */
export async function registrarAcceso(idPropietario, { codigo }) {
  return withTransaction(async (client) => {
    const reserva = await buscarReservaPorCodigo(client, idPropietario, codigo, { bloquear: true });
    const accion = accionPara(reserva);

    if (accion === ACCIONES_ACCESO.INGRESO) {
      await aplicarIngreso(client, reserva);
    } else {
      if (Date.now() - reserva.ingreso_real.getTime() < MARGEN_EGRESO_TRAS_INGRESO_MS) {
        throw ApiError.conflict('Acabas de registrar el ingreso; el egreso se marca cuando el auto se va');
      }
      await aplicarEgreso(client, reserva);
    }

    return { accion, reserva: await obtenerDetalle(client, reserva.id_reserva, { conCodigo: true }) };
  });
}
