// Maquina de estados de la reserva y los tiempos del ingreso: TRANSICIONES,
// cambiarEstado y la tolerancia de llegada. Lo usan los otros archivos de esta carpeta.
import { ApiError } from '../../utils/ApiError.js';
import { ESTADOS_COCHERA, ESTADOS_RESERVA } from '../../utils/roles.js';

/* -------------------------- ciclo de la reserva ---------------------------
   El propietario la confirma, despues registra el ingreso del vehiculo y por
   ultimo el egreso, que la finaliza y libera la cochera. El ingreso y el
   egreso solo se registran con el codigo de la reserva (registrarAcceso, en reserva-ciclo.service.js):

     PENDIENTE -> CONFIRMADA -> (ingreso) ACTIVA -> (egreso) FINALIZADA

   Ademas hay dos transiciones automaticas (src/jobs/vencimientos.job.js):
   una PENDIENTE que nunca se confirmo se cancela sola al empezar su franja, y
   una CONFIRMADA sin ingreso pasa a NO_SHOW a los TOLERANCIA_NO_SHOW_MS de
   `inicio` (y libera la cochera). Una ACTIVA sin egreso registrado, en cambio,
   no se cierra sola: la cochera queda bloqueada hasta el egreso y se abre una
   incidencia (incidencia/incidencia-vencimientos.service.js). Todas las transiciones, manuales y
   automaticas, pasan por cambiarEstado() / TRANSICIONES (abajo).
-------------------------------------------------------------------------- */

// El vehiculo puede llegar hasta 30 minutos antes de su franja.
export const MARGEN_INGRESO_MS = 30 * 60 * 1000;

// Una ACTIVA no se cierra sola: mientras el auto no egrese, la cochera queda
// bloqueada (ver finEfectivo en utils/solapamiento.js) y, pasado el margen, se
// abre una incidencia AUTO_EXCEDIDO para el propietario (incidencia/incidencia-vencimientos.service.js).

// Tolerancia de llegada: una CONFIRMADA sin ingreso a los 15 minutos de su
// `inicio` pasa a NO_SHOW y la cochera vuelve a estar disponible. Desde ese
// momento el codigo ya no registra el ingreso. Mas adelante sera configurable
// por estacionamiento.
export const TOLERANCIA_NO_SHOW_MS = 15 * 60 * 1000;

export const MENSAJE_TOLERANCIA = 'Paso la tolerancia de ingreso: la reserva quedo como ausente';
export const MENSAJE_NO_SHOW = 'La reserva quedo como ausente: el vehiculo no llego a tiempo';

/** Ultimo instante (ms) en que se acepta el ingreso: `inicio` + tolerancia, sin pasar de `fin`. */
export function limiteIngreso(reserva) {
  return Math.min(reserva.inicio.getTime() + TOLERANCIA_NO_SHOW_MS, reserva.fin.getTime());
}

/** Efecto de una transicion: deja la cochera de la reserva en `estado` (estado fisico). */
const ponerCocheraEn = (estado) => (client, reserva) =>
  client.query('UPDATE cochera SET estado_actual = $1 WHERE id_cochera = $2', [estado, reserva.id_cochera]);

/**
 * Transiciones de estado permitidas: TRANSICIONES[desde][hacia]. Si la
 * combinacion no esta, cambiarEstado() la rechaza. `efecto` corre, dentro de
 * la misma transaccion, lo que tenga que pasar ademas de mover `estado`
 * (hoy, solo el estado_actual de la cochera).
 */
const TRANSICIONES = {
  [ESTADOS_RESERVA.PENDIENTE]: {
    [ESTADOS_RESERVA.CONFIRMADA]: {},
    [ESTADOS_RESERVA.CANCELADA]: {},
  },
  [ESTADOS_RESERVA.CONFIRMADA]: {
    [ESTADOS_RESERVA.ACTIVA]: {
      efecto: ponerCocheraEn(ESTADOS_COCHERA.OCUPADA),
    },
    [ESTADOS_RESERVA.CANCELADA]: {},
    // Automatica (vencerAusentes): la cochera nunca paso a OCUPADA, asi
    // que no hay efecto; alcanza con que NO_SHOW no sea un estado vigente.
    [ESTADOS_RESERVA.NO_SHOW]: {},
  },
  [ESTADOS_RESERVA.ACTIVA]: {
    [ESTADOS_RESERVA.FINALIZADA]: {
      efecto: ponerCocheraEn(ESTADOS_COCHERA.LIBRE),
    },
    // No hay ACTIVA -> CANCELADA: una vez que el auto entro, ya no se cancela.
  },
};

/**
 * Mueve `reserva.estado` si la transicion esta permitida; si no, 409. Al
 * cancelar, `canceladaPor` (ORIGENES_CANCELACION) guarda quien lo hizo.
 */
export async function cambiarEstado(client, reserva, estadoNuevo, { canceladaPor = null } = {}) {
  const permitido = TRANSICIONES[reserva.estado]?.[estadoNuevo];
  if (!permitido) {
    throw ApiError.conflict(`No se puede pasar de ${reserva.estado} a ${estadoNuevo}`);
  }
  await client.query(
    'UPDATE reserva SET estado = $1, cancelada_por = $2 WHERE id_reserva = $3',
    [estadoNuevo, estadoNuevo === ESTADOS_RESERVA.CANCELADA ? canceladaPor : null, reserva.id_reserva],
  );
  await permitido.efecto?.(client, reserva);
}
