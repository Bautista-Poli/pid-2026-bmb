// Pedazos de SQL que comparten las consultas de estadisticas (del propietario y
// del admin): zona horaria, estados que cuentan, dias locales y los
// estacionamientos/reservas/ventanas que entran en el calculo.
//
// Parametros posicionales de las consultas del propietario:
//   $1 propietario, $2 desde (dia local), $3 hasta (dia local), $4 estacionamiento (o NULL).
import { ZONA_HORARIA } from '../../utils/horario.js';

export const ZONA = `'${ZONA_HORARIA}'`;

/** Ocupan la cochera. NO_SHOW la libera y no se cobra. */
export const OCUPAN = `('PENDIENTE', 'CONFIRMADA', 'ACTIVA', 'FINALIZADA')`;
/** Se cobran (las de abono valen 0). */
export const COBRADAS = `('FINALIZADA', 'ACTIVA')`;

/**
 * Estacionamiento de una devolucion `d`: el de su abono o el de la cochera de
 * su reserva (las de una baja no tienen incidencia, asi que no sale de ahi).
 */
export const ESTACIONAMIENTO_DE_DEVOLUCION = `COALESCE(
  (SELECT a.id_estacionamiento FROM abono a WHERE a.id_abono = d.id_abono),
  (SELECT c.id_estacionamiento FROM reserva r JOIN cochera c ON c.id_cochera = r.id_cochera
    WHERE r.id_reserva = d.id_reserva))`;

/** Inicio de un dia local (`$n::date`) como instante. */
export const desdeDia = (parametro) => `(${parametro}::date)::timestamp AT TIME ZONE ${ZONA}`;
/** Fin de un dia local (el inicio del siguiente) como instante. */
export const hastaDia = (parametro) => `(${parametro}::date + 1)::timestamp AT TIME ZONE ${ZONA}`;

/**
 * Estacionamientos que entran en el calculo: los del propietario, o uno solo.
 * Parametros: $1 propietario, $4 estacionamiento (o NULL).
 */
export const ESTACIONAMIENTOS = `
  SELECT id_estacionamiento FROM estacionamiento
   WHERE id_propietario = $1 AND ($4::uuid IS NULL OR id_estacionamiento = $4::uuid)`;

/** Reservas de esos estacionamientos con `inicio` en [$2, $3] (dias locales). */
export const RESERVAS = `
  SELECT r.*
    FROM reserva r
    JOIN cochera c ON c.id_cochera = r.id_cochera
   WHERE c.id_estacionamiento IN (${ESTACIONAMIENTOS})
     AND r.inicio >= ${desdeDia('$2')}
     AND r.inicio <  ${hastaDia('$3')}`;

// Fechas puras (date + entero): no dependen de la zona horaria de la sesion.
export const DIAS = `SELECT $2::date + i AS fecha FROM generate_series(0, $3::date - $2::date) i`;

/**
 * Por cada dia, la ventana de atencion de cada cochera activa: [apertura,
 * cierre) en hora local, con 23:59 tratado como medianoche. Es el universo de
 * la ocupacion: las horas ofrecidas son estas ventanas, y las usadas son la
 * parte de cada reserva que cae adentro. Asi la ocupacion nunca pasa el 100 %
 * (una JORNADA de 24 h en un estacionamiento que abre 12 h cuenta 12) y no suman
 * cocheras dadas de baja ni estacionamientos sin horario.
 * Necesita un CTE `dias` (ver DIAS).
 */
export const VENTANAS = `
  SELECT d.fecha, c.id_cochera,
         (d.fecha + h.hora_apertura) AT TIME ZONE ${ZONA} AS abre,
         (CASE WHEN h.hora_cierre >= '23:59' THEN (d.fecha + 1)::timestamp
               ELSE d.fecha + h.hora_cierre END) AT TIME ZONE ${ZONA} AS cierra
    FROM dias d
    JOIN cochera c ON c.activo AND c.id_estacionamiento IN (${ESTACIONAMIENTOS})
    JOIN horario h ON h.id_estacionamiento = c.id_estacionamiento
                  AND h.dia_semana = EXTRACT(DOW FROM d.fecha)`;
