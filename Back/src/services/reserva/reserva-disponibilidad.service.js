// Disponibilidad de un estacionamiento: franjas del dia (o un ingreso por hora)
// con la cantidad de cocheras libres.
import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  FRANJAS_ESTANDAR,
  instanteLocal,
  motivoFueraDeHorario,
  motivoIngresoFueraDeHorario,
  partesLocales,
} from '../../utils/horario.js';
import { ESTADOS_VIGENTES } from '../../utils/roles.js';
import { cocheraReservable, sinSolapamiento } from '../../utils/solapamiento.js';
import { HORAS_POR_MODALIDAD } from '../../utils/tarifas.js';
import { aceptaReservas } from '../estacionamiento/estacionamiento.service.js';

/**
 * Franjas del dia con la cantidad de cocheras libres. `motivo` explica por
 * que una franja no se puede reservar (fuera de horario, ya empezo o sin cochera libre)
 * y `causa` lo resume: HORARIO, PASADO o SIN_COCHERA.
 *
 * Con `modalidad` y/o `horas` cada franja es un ingreso posible: una por cada
 * hora del dia, de `horas` de largo (12 y 24 en estadia y jornada).
 */
export async function disponibilidad(idEstacionamiento, { fecha, id_tipo_vehiculo, modalidad, horas, con_abono = false }) {
  const { rows } = await query(
    'SELECT publicado, activo, estado_aprobacion FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');
  if (!aceptaReservas(rows[0], { conAbono: con_abono })) {
    throw ApiError.conflict('El estacionamiento no esta disponible para reservar');
  }

  const { rows: horarios } = await query(
    'SELECT dia_semana, hora_apertura, hora_cierre FROM horario WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  if (modalidad || horas) {
    const bloque = HORAS_POR_MODALIDAD[modalidad];
    return {
      fecha,
      franjas: await ingresosDelDia(idEstacionamiento, horarios, {
        fecha,
        id_tipo_vehiculo,
        horas: bloque ?? horas,
        porBloque: bloque !== undefined,
      }),
    };
  }

  const franjas = [];
  for (const franja of FRANJAS_ESTANDAR) {
    const inicio = instanteLocal(fecha, franja.hora_desde);
    const fin = instanteLocal(fecha, franja.hora_hasta);

    let motivo = motivoFueraDeHorario(horarios, inicio, fin);
    let causa = motivo ? 'HORARIO' : null;
    // Mismo margen que el validador de reservas: no se reserva lo que ya empezo.
    if (!motivo && inicio.getTime() < Date.now() - 60_000) {
      motivo = 'La franja ya empezo';
      causa = 'PASADO';
    }

    let libres = 0;
    if (!motivo) {
      const { rows: conteo } = await query(
        `SELECT COUNT(*)::int AS libres
           FROM cochera c
          WHERE c.id_estacionamiento = $1
            AND ${cocheraReservable()}
            AND ($2::smallint IS NULL OR c.id_tipo_vehiculo = $2)
            AND ${sinSolapamiento('$3', '$4', '$5')}`,
        [idEstacionamiento, id_tipo_vehiculo ?? null, ESTADOS_VIGENTES, inicio, fin],
      );
      libres = conteo[0].libres;
      if (libres === 0) {
        motivo = 'No quedan cocheras libres en esta franja';
        causa = 'SIN_COCHERA';
      }
    }

    franjas.push({ ...franja, inicio, fin, disponible: !motivo, cocheras_libres: libres, motivo, causa });
  }

  return { fecha, franjas };
}

/**
 * Un ingreso por cada hora del dia (00:00 a 23:00), de `horas` de largo, con
 * las cocheras libres en todo ese rango. Se cuentan en una sola consulta.
 * Por hora el rango entero tiene que caer en el horario de atencion; por
 * bloque (estadia, jornada) alcanza con entrar abierto, igual que al reservar.
 */
async function ingresosDelDia(idEstacionamiento, horarios, { fecha, id_tipo_vehiculo, horas, porBloque }) {
  const primero = instanteLocal(fecha, '00:00');
  const { rows } = await query(
    `SELECT i.inicio,
            (SELECT COUNT(*)::int
               FROM cochera c
              WHERE c.id_estacionamiento = $1
                AND ${cocheraReservable()}
                AND ($2::smallint IS NULL OR c.id_tipo_vehiculo = $2)
                AND ${sinSolapamiento('$3', 'i.inicio', 'i.inicio + make_interval(hours => $5::int)')}
            ) AS libres
       FROM generate_series($4::timestamptz, $4::timestamptz + interval '23 hours', interval '1 hour')
            AS i(inicio)
      ORDER BY i.inicio`,
    [idEstacionamiento, id_tipo_vehiculo ?? null, ESTADOS_VIGENTES, primero, horas],
  );

  return rows.map(({ inicio, libres }) => {
    const fin = new Date(inicio.getTime() + horas * 3_600_000);
    let motivo = porBloque
      ? motivoIngresoFueraDeHorario(horarios, inicio)
      : motivoFueraDeHorario(horarios, inicio, fin);
    let causa = motivo ? 'HORARIO' : null;
    if (!motivo && inicio.getTime() < Date.now() - 60_000) {
      motivo = 'Ese horario ya empezo';
      causa = 'PASADO';
    }
    if (!motivo && libres === 0) {
      motivo = 'No quedan cocheras libres en ese horario';
      causa = 'SIN_COCHERA';
    }
    const hasta = partesLocales(fin);
    return {
      hora_desde: partesLocales(inicio).hora,
      hora_hasta: hasta.hora,
      fecha_hasta: hasta.fecha,
      inicio,
      fin,
      disponible: !motivo,
      cocheras_libres: motivo ? 0 : libres,
      motivo,
      causa,
    };
  });
}
