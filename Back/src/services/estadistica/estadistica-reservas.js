// Reservas del periodo: demanda por dia y hora, y conteos (canceladas,
// ausentes, anticipacion de las cancelaciones).
import { query } from '../../config/database.js';
import { OCUPAN, RESERVAS, ZONA } from './estadistica-sql.js';

/** Reservas por (dia de semana, hora local) que ocupan cada hora; sin canceladas ni ausentes. */
export async function demanda(parametros) {
  const { rows } = await query(
    `SELECT EXTRACT(DOW FROM hora)::int AS dia_semana, EXTRACT(HOUR FROM hora)::int AS hora,
            COUNT(*)::int AS reservas
       FROM (${RESERVAS}) r,
            LATERAL generate_series(
              date_trunc('hour', r.inicio AT TIME ZONE ${ZONA}),
              (r.fin AT TIME ZONE ${ZONA}) - interval '1 second',
              interval '1 hour'
            ) AS hora
      WHERE r.estado IN ${OCUPAN}
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    parametros,
  );
  return rows.map((r) => ({ diaSemana: r.dia_semana, hora: r.hora, reservas: r.reservas }));
}

/** Totales del periodo: reservas, canceladas por origen, ausentes y anticipacion. */
export async function conteos(parametros) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA')::int AS canceladas,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA' AND cancelada_por = 'CONDUCTOR')::int AS conductor,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA' AND cancelada_por = 'PROPIETARIO')::int AS propietario,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA' AND cancelada_por = 'SISTEMA')::int AS sistema,
            COUNT(*) FILTER (WHERE estado = 'CANCELADA' AND cancelada_por IS NULL)::int AS sin_dato,
            COUNT(*) FILTER (WHERE estado = 'NO_SHOW')::int AS ausentes,
            AVG(EXTRACT(EPOCH FROM (inicio - cancelada_en)) / 3600)
              FILTER (WHERE estado = 'CANCELADA' AND cancelada_por = 'CONDUCTOR'
                        AND cancelada_en < inicio AND id_abono IS NULL)
              AS anticipacion
       FROM (${RESERVAS}) r`,
    parametros,
  );
  return rows[0];
}
