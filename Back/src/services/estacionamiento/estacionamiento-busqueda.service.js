// Busqueda publica de estacionamientos (Explorar): arma el WHERE segun los
// filtros que llegan en la URL. El resto del ABM esta en estacionamiento.service.js.
import { query } from '../../config/database.js';
import { ZONA_HORARIA } from '../../utils/horario.js';
import { sinSolapamiento } from '../../utils/solapamiento.js';
import { HORAS_POR_MODALIDAD } from '../../utils/tarifas.js';
import { ESTADOS_APROBACION, ESTADOS_VIGENTES } from '../../utils/roles.js';
import { AGREGADOS, CAMPOS_E, reputacionPublica } from './estacionamiento.service.js';
import {
  COLUMNAS_REPUTACION,
  ES_DESTACADO,
  condicionNivelMinimo,
  darFormaReputacion,
} from '../reputacion/reputacion-sql.js';

/**
 * Condicion SQL "el estacionamiento `e` atiende durante [inicio, fin)", en hora
 * argentina y el mismo dia. Sin horarios cargados no se restringe (igual que al
 * reservar, ver `motivoFueraDeHorario`).
 */
function abiertoEntre(inicio, fin) {
  const desde = `(${inicio} AT TIME ZONE '${ZONA_HORARIA}')`;
  const hasta = `(${fin} AT TIME ZONE '${ZONA_HORARIA}')`;
  return `(
    NOT EXISTS (SELECT 1 FROM horario h WHERE h.id_estacionamiento = e.id_estacionamiento)
    OR EXISTS (
      SELECT 1 FROM horario h
       WHERE h.id_estacionamiento = e.id_estacionamiento
         AND h.dia_semana = EXTRACT(DOW FROM ${desde})
         AND ${desde}::date = ${hasta}::date
         AND h.hora_apertura <= ${desde}::time
         AND h.hora_cierre >= ${hasta}::time
    )
  )`;
}

/**
 * Busqueda publica: solo estacionamientos publicados y activos, con cocheras
 * libres, tipos admitidos y horarios para poder comparar opciones.
 */
export async function buscar(filtros) {
  const condiciones = [
    'e.publicado = TRUE',
    'e.activo = TRUE',
    `e.estado_aprobacion = '${ESTADOS_APROBACION.APROBADO}'`,
  ];
  const parametros = [];

  if (filtros.q) {
    parametros.push(`%${filtros.q}%`);
    const p = `$${parametros.length}`;
    condiciones.push(
      `(e.nombre ILIKE ${p} OR e.direccion ILIKE ${p} OR e.barrio_zona ILIKE ${p} OR e.descripcion ILIKE ${p})`,
    );
  }

  if (filtros.zona) {
    parametros.push(`%${filtros.zona}%`);
    condiciones.push(`e.barrio_zona ILIKE $${parametros.length}`);
  }

  // El filtro de precio es por hora. Sin tarifa por hora, cuenta lo que sale
  // la hora en su estadia (12 h) o su jornada (24 h).
  const precioHora = `COALESCE(e.tarifa_hora, e.tarifa_estadia / ${HORAS_POR_MODALIDAD.ESTADIA},
                               e.tarifa_jornada / ${HORAS_POR_MODALIDAD.JORNADA})`;

  if (filtros.tarifa_min !== undefined) {
    parametros.push(filtros.tarifa_min);
    condiciones.push(`${precioHora} >= $${parametros.length}`);
  }

  if (filtros.tarifa_max !== undefined) {
    parametros.push(filtros.tarifa_max);
    condiciones.push(`${precioHora} <= $${parametros.length}`);
  }

  if (filtros.destacados) condiciones.push(ES_DESTACADO);
  // "Oro o mas", "solo Diamante"...: nivel minimo de reputacion.
  if (filtros.nivel_minimo) condiciones.push(condicionNivelMinimo(filtros.nivel_minimo));

  if (filtros.cubierto !== undefined) {
    parametros.push(filtros.cubierto);
    condiciones.push(`e.cubierto = $${parametros.length}`);
  }

  // La parte del mapa que se esta viendo: sin coordenadas no se puede ubicar.
  if (filtros.lat_min !== undefined) {
    parametros.push(filtros.lat_min, filtros.lat_max, filtros.lng_min, filtros.lng_max);
    const n = parametros.length;
    condiciones.push(
      `e.latitud BETWEEN $${n - 3} AND $${n - 2} AND e.longitud BETWEEN $${n - 1} AND $${n}`,
    );
  }

  // Una cochera "sirve" si esta activa, no esta bloqueada por mantenimiento,
  // es del tipo pedido (si se pidio) y, si se pidio disponibilidad, no tiene
  // una reserva vigente que se pise.
  const compatibles = [
    'ct.id_estacionamiento = e.id_estacionamiento', 'ct.activo = TRUE', 'NOT ct.bloqueada',
  ];
  const BASE_COMPATIBLES = compatibles.length;

  if (filtros.id_tipo_vehiculo !== undefined) {
    parametros.push(filtros.id_tipo_vehiculo);
    compatibles.push(`ct.id_tipo_vehiculo = $${parametros.length}`);
  }

  if (filtros.inicio && filtros.fin) {
    parametros.push(ESTADOS_VIGENTES, filtros.inicio, filtros.fin);
    const n = parametros.length;
    compatibles.push(sinSolapamiento(`$${n - 2}`, `$${n - 1}`, `$${n}`, 'ct.id_cochera'));
  } else if (filtros.disponible_ahora) {
    parametros.push(ESTADOS_VIGENTES);
    compatibles.push(sinSolapamiento(`$${parametros.length}`, 'now()', 'now()', 'ct.id_cochera'));
  }

  // Con `incluir_no_disponibles` la disponibilidad no descarta: se informa en
  // `disponible` (hay una cochera del tipo libre en ese momento y esta abierto).
  // El tipo de vehiculo si sigue filtrando: un estacionamiento sin cocheras para el
  // vehiculo no sirve aunque este libre.
  let columnaDisponible = '';
  const hayDisponibilidad = (filtros.inicio && filtros.fin) || filtros.disponible_ahora;

  if (filtros.incluir_no_disponibles && hayDisponibilidad) {
    const soloTipo = compatibles.slice(0, BASE_COMPATIBLES + (filtros.id_tipo_vehiculo !== undefined ? 1 : 0));
    const libre = [...compatibles];
    let abierto;
    if (filtros.inicio && filtros.fin) {
      const n = parametros.length;
      abierto = abiertoEntre(`$${n - 1}::timestamptz`, `$${n}::timestamptz`);
    } else {
      // Ahora tambien cuenta el estado fisico: una cochera OCUPADA no sirve.
      libre.push(`ct.estado_actual = 'LIBRE'`);
      abierto = abiertoEntre('now()', 'now()');
    }
    if (soloTipo.length > BASE_COMPATIBLES) {
      condiciones.push(`EXISTS (SELECT 1 FROM cochera ct WHERE ${soloTipo.join(' AND ')})`);
    }
    columnaDisponible = `,
      (EXISTS (SELECT 1 FROM cochera ct WHERE ${libre.join(' AND ')}) AND ${abierto}) AS disponible`;
  } else if (compatibles.length > BASE_COMPATIBLES) {
    condiciones.push(`EXISTS (SELECT 1 FROM cochera ct WHERE ${compatibles.join(' AND ')})`);
  }

  parametros.push(filtros.limit, filtros.offset);

  const { rows } = await query(
    `SELECT ${CAMPOS_E}, ${AGREGADOS}, ${COLUMNAS_REPUTACION}${columnaDisponible}
       FROM estacionamiento e
       ${reputacionPublica()}
      WHERE ${condiciones.join(' AND ')}
      -- Sin calificaciones el puntaje supone un 4: van despues de los calificados.
      ORDER BY ${ES_DESTACADO} DESC, (rep.cal_cantidad > 0) DESC, rep.puntaje DESC, e.nombre
      LIMIT $${parametros.length - 1} OFFSET $${parametros.length}`,
    parametros,
  );

  return rows.map(darFormaReputacion);
}
