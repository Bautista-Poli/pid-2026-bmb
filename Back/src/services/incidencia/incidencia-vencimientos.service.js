// Incidencias que crea el sistema (src/jobs/vencimientos.job.js): AUTO_EXCEDIDO
// y RESERVA_AFECTADA, y la constancia del egreso de un auto excedido.
import { query, withTransaction } from '../../config/database.js';
import { HORA_LOCAL } from '../../utils/horario.js';
import { ESTADOS_RESERVA } from '../../utils/roles.js';
import { buscarCocheraLibre } from '../cochera/cochera-libre.js';
import { SISTEMA, TIPOS_INCIDENCIA, agregarMensaje } from './incidencia-comun.js';

// Unos minutos de gracia antes de avisar: salir 2 minutos tarde no es un problema.
const MARGEN_EXCESO_MS = 15 * 60 * 1000;

// La reserva siguiente se protege cuando ya puede ingresar (30 min antes de su
// inicio, igual que MARGEN_INGRESO_MS en reserva/reserva-estados.js).
const ANTICIPACION_REASIGNACION_MS = 30 * 60 * 1000;

export const AVISO_REASIGNADA_POR_EXCESO =
  'Te reasignamos a otra cochera: la tuya sigue ocupada por el vehiculo anterior.';
export const AVISO_AFECTADA_POR_EXCESO =
  'Tu cochera sigue ocupada por el vehiculo anterior y no habia otra libre. ' +
  'El estacionamiento te va a indicar donde estacionar.';

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
    const id = await withTransaction(async (client) => {
      // Si el egreso llego entre la busqueda y aca, ya no es un auto excedido.
      const { rows: sigue } = await client.query(
        'SELECT 1 FROM reserva WHERE id_reserva = $1 AND estado = $2 FOR UPDATE',
        [r.id_reserva, ESTADOS_RESERVA.ACTIVA],
      );
      if (!sigue[0]) return null;
      return crearIncidencia(client, {
        tipo: TIPOS_INCIDENCIA.AUTO_EXCEDIDO,
        idReserva: r.id_reserva,
        idEstacionamiento: r.id_estacionamiento,
        mensaje:
          `El vehiculo ${r.patente} tenia que salir de la cochera ${r.cochera} a las ` +
          `${HORA_LOCAL.format(r.fin)} y sigue adentro. La cochera queda bloqueada hasta que se registre el egreso.`,
      });
    });
    if (id) creadas += 1;
  }
  return creadas;
}

/**
 * Reservas que estan por empezar (o ya empezaron) en una cochera donde sigue un
 * auto excedido: se reasignan a otra cochera libre del mismo estacionamiento y
 * tipo; si no hay, quedan donde estan con un aviso para el conductor y una
 * incidencia RESERVA_AFECTADA para el propietario. Una afectada se vuelve a
 * intentar en cada revision, mientras su incidencia siga abierta: si se libera
 * otra cochera, se reasigna.
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
          SELECT 1 FROM incidencia i
           WHERE i.id_reserva = r.id_reserva AND i.tipo = $5 AND i.estado NOT IN ('ABIERTA', 'DENUNCIADA')
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
        `SELECT r.id_reserva, r.inicio, r.fin, r.id_cochera, r.estado, r.motivo_reasignacion,
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

      const { libre } = await buscarCocheraLibre(client, {
        idEstacionamiento: reserva.id_estacionamiento,
        idTipoVehiculo: reserva.id_tipo_vehiculo,
        inicio: reserva.inicio,
        fin: reserva.fin,
        excluir: reserva.id_cochera,
      });
      const alternativa = libre?.id_cochera;
      if (alternativa) {
        await client.query(
          'UPDATE reserva SET id_cochera = $1, motivo_reasignacion = $2 WHERE id_reserva = $3',
          [alternativa, AVISO_REASIGNADA_POR_EXCESO, reserva.id_reserva],
        );
        await avisarReasignacionTardia(client, reserva.id_reserva);
        return 'reasignadas';
      }
      // Ya estaba afectada y sigue sin alternativa: no hay nada nuevo.
      if (reserva.motivo_reasignacion === AVISO_AFECTADA_POR_EXCESO) return null;

      await client.query('UPDATE reserva SET motivo_reasignacion = $1 WHERE id_reserva = $2', [
        AVISO_AFECTADA_POR_EXCESO,
        reserva.id_reserva,
      ]);
      await crearIncidencia(client, {
        tipo: TIPOS_INCIDENCIA.RESERVA_AFECTADA,
        idReserva: reserva.id_reserva,
        idEstacionamiento: reserva.id_estacionamiento,
        mensaje:
          `La reserva de ${reserva.patente} (${HORA_LOCAL.format(reserva.inicio)} a ${HORA_LOCAL.format(reserva.fin)}) ` +
          `no se pudo reasignar: la cochera ${reserva.cochera} sigue ocupada por el vehiculo anterior ` +
          'y no hay otra libre en ese horario.',
      });
      return 'afectadas';
    });
    if (accion) resultado[accion] += 1;
  }
  return resultado;
}

/** Una afectada que se pudo reasignar despues: queda constancia en su incidencia. */
async function avisarReasignacionTardia(client, idReserva) {
  const { rows } = await client.query(
    `SELECT id_incidencia FROM incidencia
      WHERE id_reserva = $1 AND tipo = $2 AND estado IN ('ABIERTA', 'DENUNCIADA')`,
    [idReserva, TIPOS_INCIDENCIA.RESERVA_AFECTADA],
  );
  if (rows[0]) {
    await agregarMensaje(client, rows[0].id_incidencia, SISTEMA, 'Se libero otra cochera y la reserva se reasigno.');
  }
}

/**
 * Lo llama el egreso (reserva/reserva-ciclo.service.js): si el auto se habia excedido, se
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
    `El vehiculo egreso a las ${HORA_LOCAL.format(egreso)}, ${minutos} min despues de su horario. La cochera quedo libre.`,
  );
}
