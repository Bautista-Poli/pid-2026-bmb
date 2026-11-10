// Buscar una cochera libre (la usan crear reserva, el bloqueo y las
// incidencias) y el orden natural de los identificadores.
import { ESTADOS_VIGENTES } from '../../utils/roles.js';
import { cocheraReservable, sinSolapamiento } from '../../utils/solapamiento.js';

/**
 * `identificador` es texto, asi que ordenarlo tal cual pone la cochera 10 antes
 * que la 2. Ordena por la parte numerica y deja al final los identificadores
 * alfanumericos viejos ("A-01"), que ya no se pueden dar de alta.
 */
export const ORDEN_NATURAL = `
  NULLIF(regexp_replace(c.identificador, '\\D', '', 'g'), '')::int NULLS LAST,
  c.identificador`;

/**
 * La primera cochera libre del estacionamiento para ese tipo de vehiculo y esa
 * franja (opcionalmente sin contar `excluir`). Bloquea las candidatas con
 * FOR UPDATE siempre en el mismo orden (por id) antes de buscar
 * solapamientos: asi dos pedidos simultaneos no eligen la misma ni se
 * bloquean entre si. Devuelve cuantas candidatas habia y la elegida (o null).
 */
export async function buscarCocheraLibre(client, { idEstacionamiento, idTipoVehiculo, inicio, fin, excluir = null }) {
  const { rows: candidatas } = await client.query(
    `SELECT c.id_cochera
       FROM cochera c
      WHERE c.id_estacionamiento = $1
        AND ${cocheraReservable()}
        AND c.id_tipo_vehiculo = $2
        AND ($3::uuid IS NULL OR c.id_cochera <> $3)
      ORDER BY c.id_cochera
      FOR UPDATE`,
    [idEstacionamiento, idTipoVehiculo, excluir],
  );
  if (candidatas.length === 0) return { candidatas: 0, libre: null };

  const { rows: libres } = await client.query(
    `SELECT c.id_cochera, c.id_estacionamiento, c.identificador
       FROM cochera c
      WHERE c.id_cochera = ANY($1::uuid[])
        AND ${sinSolapamiento('$2', '$3', '$4')}
      ORDER BY ${ORDEN_NATURAL}
      LIMIT 1`,
    [candidatas.map((c) => c.id_cochera), ESTADOS_VIGENTES, inicio, fin],
  );
  return { candidatas: candidatas.length, libre: libres[0] ?? null };
}
