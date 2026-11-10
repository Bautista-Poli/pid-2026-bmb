// Baja de estacionamientos: la del propietario (uno) y la que usa la baja de la
// cuenta (varios, dentro de su transaccion).
import { withTransaction } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { ESTADOS_COCHERA } from '../../utils/roles.js';
import { cancelarPorBajaDeEstacionamientos as cancelarAbonos } from '../abono.service.js';
import { CAMPOS, asegurarPropiedad } from './estacionamiento.service.js';

/**
 * Baja logica: las cocheras tienen reservas historicas (FK RESTRICT), asi que
 * se desactiva todo en cascada y se cancelan las reservas que todavia no
 * empezaron. Para sacarlo del listado sin darlo de baja alcanza con
 * `PATCH { publicado: false }`.
 */
export async function darDeBaja(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT activo FROM estacionamiento WHERE id_estacionamiento = $1 FOR UPDATE',
      [idEstacionamiento],
    );

    if (!rows[0].activo) throw ApiError.conflict('El estacionamiento ya esta dado de baja');

    await darDeBajaEnTransaccion(client, [idEstacionamiento]);

    const { rows: actualizado } = await client.query(
      `SELECT ${CAMPOS} FROM estacionamiento WHERE id_estacionamiento = $1`,
      [idEstacionamiento],
    );
    return actualizado[0];
  });
}

/**
 * La baja de uno o varios estacionamientos, dentro de una transaccion (la usan
 * darDeBaja y la baja de la cuenta). Con un vehiculo adentro (reserva ACTIVA,
 * aunque se haya excedido) se rechaza: primero tiene que registrarse su egreso.
 * Las reservas que todavia no empezaron se cancelan, los abonos vigentes se
 * cancelan con la devolucion de lo no usado, y se desactiva todo.
 */
export async function darDeBajaEnTransaccion(client, idsEstacionamientos) {
  if (idsEstacionamientos.length === 0) return;

  const { rows: adentro } = await client.query(
    `SELECT 1 FROM reserva r JOIN cochera c ON c.id_cochera = r.id_cochera
      WHERE c.id_estacionamiento = ANY($1::uuid[]) AND r.estado = 'ACTIVA' LIMIT 1`,
    [idsEstacionamientos],
  );
  if (adentro[0]) throw ApiError.conflict(MENSAJE_VEHICULO_ADENTRO);

  await client.query(
    `UPDATE reserva r SET estado = 'CANCELADA', cancelada_por = 'PROPIETARIO'
       FROM cochera c
      WHERE c.id_cochera = r.id_cochera
        AND c.id_estacionamiento = ANY($1::uuid[])
        AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
        AND r.fin > now()`,
    [idsEstacionamientos],
  );

  await cancelarAbonos(client, idsEstacionamientos);

  await client.query(
    'UPDATE cochera SET activo = FALSE, estado_actual = $1 WHERE id_estacionamiento = ANY($2::uuid[])',
    [ESTADOS_COCHERA.INACTIVA, idsEstacionamientos],
  );
  await client.query(
    'UPDATE estacionamiento SET activo = FALSE, publicado = FALSE WHERE id_estacionamiento = ANY($1::uuid[])',
    [idsEstacionamientos],
  );
}

export const MENSAJE_VEHICULO_ADENTRO =
  'Hay un vehiculo adentro: registra su egreso antes de dar de baja';
