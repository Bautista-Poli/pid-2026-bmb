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
//
// En esta carpeta: lo compartido (tipos, estados, canales, el SELECT) en este
// archivo; el chat y el ciclo en incidencia.service.js; los reclamos en
// incidencia-reclamo.service.js y lo que crea el sistema en
// incidencia-vencimientos.service.js.
import { ApiError } from '../../utils/ApiError.js';
import { PAGADO_RESERVA } from '../devolucion.service.js';

export const TIPOS_INCIDENCIA = Object.freeze({
  AUTO_EXCEDIDO: 'AUTO_EXCEDIDO',
  RESERVA_AFECTADA: 'RESERVA_AFECTADA',
  // Lo abre el conductor sobre una reserva o un abono suyo.
  RECLAMO: 'RECLAMO',
});

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

export const SISTEMA = 'SISTEMA';

/** Suma un mensaje al chat de una incidencia (en el canal indicado). */
export async function agregarMensaje(
  ejecutor, idIncidencia, rolAutor, texto, idAutor = null, canal = CANALES.GENERAL, montoPropuesto = null,
) {
  await ejecutor.query(
    `INSERT INTO incidencia_mensaje (id_incidencia, id_autor, rol_autor, texto, canal, monto_propuesto)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [idIncidencia, idAutor, rolAutor, texto, canal, montoPropuesto],
  );
}

// Una incidencia es sobre una reserva o (solo los reclamos) sobre un abono: el
// conductor es el de cualquiera de los dos. Los montos salen como texto de pg
// y se pasan a numero en `conMontos`.
export const CONDUCTOR = 'COALESCE(r.id_conductor, a.id_conductor)';

export const SELECT_INCIDENCIA = `
  SELECT i.id_incidencia, i.tipo::text AS tipo, i.estado::text AS estado,
         i.created_at, i.denunciada_at, i.resuelta_at, i.retirada_at, i.denunciada_por::text AS denunciada_por,
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

/** Convierte un monto de pg a numero, dejando null como null. */
export const aNumero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

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
