// Ciclo de la reserva del lado del propietario: confirmar, marcar ausente y el
// ingreso/egreso por codigo (ver el diagrama en reserva-estados.js).
import { query, withTransaction } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { normalizarCodigo } from '../../utils/codigoAcceso.js';
import { HORA_LOCAL } from '../../utils/horario.js';
import { ESTADOS_RESERVA } from '../../utils/roles.js';
import { registrarEgresoEnIncidencia } from '../incidencia/incidencia-vencimientos.service.js';
import { obtenerDetalle } from './reserva-detalle.js';
import {
  MARGEN_INGRESO_MS,
  MENSAJE_NO_SHOW,
  MENSAJE_TOLERANCIA,
  cambiarEstado,
  limiteIngreso,
} from './reserva-estados.js';

/** Bloquea la reserva y verifica que la cochera sea de un estacionamiento propio. */
async function extenderReserva(precio_adicionado, fecha_adicionada , precio_total_adicionado, idReserva) {
  /**
   * 
   * const { rows } = await client.query(
    'UPDATE reserva SET precio_adicionado = $1,adicionado = $2, precio_total_adicionado = $2 WHERE id_reserva = $3',
    [precio_adicionado, fecha_adicionada , precio_total_adicionado, idReserva],
  );
   */
  const { rows } = await client.query(
    `SELECT r.precio, 
    FROM reserva`
  )

  const reserva = rows[0];
  if (!reserva) throw ApiError.notFound('La reserva no existe');
  return reserva;
}