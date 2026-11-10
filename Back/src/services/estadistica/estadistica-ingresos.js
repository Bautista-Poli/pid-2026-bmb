// Plata del propietario: lo cobrado por dia (reservas + abonos - devoluciones) y
// lo que falta cobrar.
import { query } from '../../config/database.js';
import { numero } from './estadistica-calculos.js';
import {
  COBRADAS,
  DIAS,
  ESTACIONAMIENTOS,
  ESTACIONAMIENTO_DE_DEVOLUCION,
  RESERVAS,
  ZONA,
  desdeDia,
  hastaDia,
} from './estadistica-sql.js';

/** Lo cobrado por dia: reservas mas abonos. */
export async function ingresosPorDia(parametros) {
  const { rows } = await query(
    `WITH dias AS (${DIAS}),
     reservas AS (
       SELECT (r.inicio AT TIME ZONE ${ZONA})::date AS fecha, SUM(r.precio_total) AS monto
         FROM (${RESERVAS}) r
        WHERE r.estado IN ${COBRADAS} AND r.modalidad <> 'ABONO'
        GROUP BY 1
     ),
     abonos AS (
       SELECT (a.created_at AT TIME ZONE ${ZONA})::date AS fecha, SUM(a.precio_total) AS monto
         FROM abono a
        WHERE a.id_estacionamiento IN (${ESTACIONAMIENTOS})
          AND a.created_at >= ${desdeDia('$2')}
          AND a.created_at <  ${hastaDia('$3')}
        GROUP BY 1
     ),
     devoluciones AS (
       SELECT (d.created_at AT TIME ZONE ${ZONA})::date AS fecha, SUM(d.monto) AS monto
         FROM devolucion d
        WHERE ${ESTACIONAMIENTO_DE_DEVOLUCION} IN (${ESTACIONAMIENTOS})
          AND d.created_at >= ${desdeDia('$2')}
          AND d.created_at <  ${hastaDia('$3')}
        GROUP BY 1
     )
     SELECT d.fecha::text AS fecha, COALESCE(r.monto, 0) AS reservas, COALESCE(a.monto, 0) AS abonos,
            COALESCE(dv.monto, 0) AS devoluciones
       FROM dias d
       LEFT JOIN reservas r ON r.fecha = d.fecha
       LEFT JOIN abonos a ON a.fecha = d.fecha
       LEFT JOIN devoluciones dv ON dv.fecha = d.fecha
      ORDER BY d.fecha`,
    parametros,
  );
  return rows.map((r) => ({
    fecha: r.fecha,
    reservas: numero(r.reservas),
    abonos: numero(r.abonos),
    devoluciones: numero(r.devoluciones),
  }));
}

/**
 * Lo que falta cobrar: reservas CONFIRMADAS que todavia no empezaron, sean del
 * periodo o posteriores (el periodo siempre termina hoy, asi que limitarlo
 * dejaria afuera casi todo). Las de abono valen 0.
 */
export async function porCobrar(idPropietario, idEstacionamiento) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(r.precio_total), 0) AS monto
       FROM reserva r
       JOIN cochera c ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE e.id_propietario = $1
        AND ($2::uuid IS NULL OR e.id_estacionamiento = $2::uuid)
        AND r.estado = 'CONFIRMADA'
        AND r.inicio > now()`,
    [idPropietario, idEstacionamiento ?? null],
  );
  return numero(rows[0].monto);
}
