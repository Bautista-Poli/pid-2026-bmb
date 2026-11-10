// La reserva "con todo" que devuelven los listados y las acciones (selectDetalle).
import { PLAZO_CALIFICACION_DIAS } from '../calificacion.service.js';
import { lateralReputacionConductor } from '../reputacion/reputacion-conductor.service.js';

/**
 * Lo que ve el propietario del lado de la calificacion del conductor: su
 * reputacion, lo que le puso en esta reserva y si todavia lo puede calificar.
 */
const COLUMNAS_DEL_PROPIETARIO = `,
         rc.promedio AS conductor_promedio, rc.cantidad AS conductor_calificaciones,
         qp.puntaje AS calificacion_al_conductor,
         (qp.puntaje IS NULL AND (
           (r.estado = 'FINALIZADA' AND r.ingreso_real IS NOT NULL AND r.egreso_real IS NOT NULL
             AND r.egreso_real > now() - make_interval(days => ${PLAZO_CALIFICACION_DIAS}))
           OR (r.estado = 'NO_SHOW' AND r.fin > now() - make_interval(days => ${PLAZO_CALIFICACION_DIAS}))
         )) AS conductor_calificable`;

const JOINS_DEL_PROPIETARIO = `${lateralReputacionConductor('r.id_conductor')}
    LEFT JOIN calificacion qp ON qp.id_reserva = r.id_reserva AND qp.autor = 'PROPIETARIO'`;

/**
 * Reserva con todo lo que muestran los listados, con la modalidad y el precio
 * guardados al reservar. El codigo de acceso va solo con `conCodigo`: es del
 * conductor, y el propietario no lo tiene hasta que se lo dan o escanea el QR
 * (la pantalla de acceso, donde ya lo trae, es la unica excepcion).
 *
 * `vista` es quien la pide. Al CONDUCTOR no le va lo que el propietario le
 * puso (ni su reputacion): podria verlo antes de calificar al estacionamiento
 * y responder en consecuencia.
 */
export const selectDetalle = ({ conCodigo = false, vista = 'PROPIETARIO' } = {}) => `
  SELECT r.id_reserva, r.id_conductor, r.inicio, r.fin, r.created_at,
         r.ingreso_real, r.egreso_real, r.estado::text AS estado,
         r.cancelada_por::text AS cancelada_por,
         r.id_vehiculo, v.patente, v.marca, v.modelo, v.id_tipo_vehiculo,
         r.id_cochera, c.identificador AS cochera,
         c.sector AS cochera_sector, c.cubierta AS cochera_cubierta,
         e.id_estacionamiento, e.nombre AS estacionamiento, e.direccion,
         r.modalidad, r.precio_total, r.motivo_reasignacion,${conCodigo ? ' r.codigo_acceso,' : ''}
         r.id_abono, a.turno::text AS turno_abono,
         u.nombre AS conductor_nombre, u.apellido AS conductor_apellido,
         (SELECT COALESCE(SUM(d.monto), 0)::float FROM devolucion d
           WHERE d.id_reserva = r.id_reserva) AS devuelto,
         (SELECT i.id_incidencia FROM incidencia i
           WHERE i.id_reserva = r.id_reserva AND i.abierta_por IS NOT NULL
             AND i.estado IN ('ABIERTA', 'DENUNCIADA')
           LIMIT 1) AS reclamo_abierto,
         -- Calificacion: el promedio que dio (null si no califico) y si todavia puede.
         q.promedio AS calificacion_promedio,
         (q.promedio IS NULL AND r.estado = 'FINALIZADA'
           AND r.ingreso_real IS NOT NULL AND r.egreso_real IS NOT NULL
           AND r.egreso_real > now() - make_interval(days => ${PLAZO_CALIFICACION_DIAS})) AS calificable${
           vista === 'PROPIETARIO' ? COLUMNAS_DEL_PROPIETARIO : ''
         }
    FROM reserva r
    JOIN vehiculo v        ON v.id_vehiculo = r.id_vehiculo
    JOIN cochera c         ON c.id_cochera = r.id_cochera
    JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
    JOIN usuario u         ON u.id_usuario = r.id_conductor
    LEFT JOIN abono a      ON a.id_abono = r.id_abono
    LEFT JOIN LATERAL (
      SELECT ROUND(COALESCE(
               (cq.limpieza + cq.infraestructura + cq.atencion + cq.seguridad + cq.acceso) / 5.0, cq.puntaje
             )::numeric, 1)::float AS promedio
        FROM calificacion cq WHERE cq.id_reserva = r.id_reserva AND cq.autor = 'CONDUCTOR'
    ) q ON TRUE
    ${vista === 'PROPIETARIO' ? JOINS_DEL_PROPIETARIO : ''}
`;

/** `ejecutor` es el client de una transaccion o cualquier objeto con `query`. */
export async function obtenerDetalle(ejecutor, idReserva, { conCodigo = false, vista } = {}) {
  const { rows } = await ejecutor.query(`${selectDetalle({ conCodigo, vista })} WHERE r.id_reserva = $1`, [
    idReserva,
  ]);
  return rows[0];
}
