// Ocupacion del propietario: horas usadas contra horas ofrecidas, por dia.
import { query } from '../../config/database.js';
import { numero, redondear } from './estadistica-calculos.js';
import { DIAS, OCUPAN, VENTANAS } from './estadistica-sql.js';

/** Horas ocupadas y horas disponibles por dia (para la ocupacion). */
export async function horasPorDia(parametros) {
  const { rows } = await query(
    `WITH dias AS (${DIAS}),
     ventanas AS (${VENTANAS}),
     ofrecidas AS (
       SELECT fecha, SUM(EXTRACT(EPOCH FROM (cierra - abre)) / 3600) AS horas
         FROM ventanas GROUP BY fecha
     ),
     usadas AS (
       SELECT v.fecha,
              SUM(EXTRACT(EPOCH FROM (LEAST(r.fin, v.cierra) - GREATEST(r.inicio, v.abre))) / 3600) AS horas
         FROM ventanas v
         JOIN reserva r ON r.id_cochera = v.id_cochera
                       AND r.inicio < v.cierra
                       AND r.fin > v.abre
                       AND r.estado IN ${OCUPAN}
        GROUP BY v.fecha
     )
     SELECT d.fecha::text AS fecha, COALESCE(u.horas, 0) AS usadas, COALESCE(o.horas, 0) AS ofrecidas
       FROM dias d
       LEFT JOIN usadas u ON u.fecha = d.fecha
       LEFT JOIN ofrecidas o ON o.fecha = d.fecha
      ORDER BY d.fecha`,
    parametros,
  );
  return rows.map((r) => ({
    fecha: r.fecha,
    horasUsadas: redondear(numero(r.usadas)),
    horasOfrecidas: redondear(numero(r.ofrecidas)),
  }));
}
