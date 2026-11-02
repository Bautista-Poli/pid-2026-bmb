// Revision de vencimientos, al usar la app:
// - reserva.service.js: PENDIENTE sin confirmar que ya empezo -> CANCELADA, y
//   CONFIRMADA sin ingreso pasada TOLERANCIA_NO_SHOW_MS -> NO_SHOW.
// - incidencia.service.js: ACTIVA que se paso de su fin sin egreso -> incidencia
//   AUTO_EXCEDIDO (la reserva NO se cierra: la cochera queda bloqueada hasta el
//   egreso), y las reservas siguientes de esa cochera se reasignan a otra o,
//   sin alternativa, quedan con una incidencia RESERVA_AFECTADA.
// - cochera.service.js: cocheras bloqueadas con `bloqueada_hasta` vencido se desbloquean solas.
// - abono.service.js: abonos VIGENTES con `hasta` vencido -> VENCIDO.
//
// No hay cron: la revision corre antes de atender un pedido a la API, como
// mucho una vez por INTERVALO_MS. Sin trafico no se consulta la base y Neon
// puede suspenderse. El pedido espera a que la revision termine, asi lo que
// devuelve ya esta al dia (p. ej. un NO_SHOW libera la cochera antes de
// calcular la disponibilidad). Las pruebas la apagan (VENCIMIENTOS_ENABLED) y
// llaman a las funciones de los services a mano.
import { config } from '../config/env.js';
import { vencerAbonos } from '../services/abono.service.js';
import { desbloquearVencidas } from '../services/cochera.service.js';
import { detectarExcedidos, protegerReservasSiguientes } from '../services/incidencia.service.js';
import { vencerAusentes, vencerPendientesSinConfirmar } from '../services/reserva.service.js';

export const INTERVALO_MS = 60 * 1000;

async function revisar() {
  try {
    const canceladas = await vencerPendientesSinConfirmar();
    const ausentes = await vencerAusentes();
    const excedidos = await detectarExcedidos();
    const { reasignadas, afectadas } = await protegerReservasSiguientes();
    const desbloqueadas = await desbloquearVencidas();
    const abonosVencidos = await vencerAbonos();
    if (canceladas || ausentes || excedidos || reasignadas || afectadas || desbloqueadas || abonosVencidos) {
      console.log(
        `[vencimientos] ${canceladas} pendiente(s) cancelada(s), ${ausentes} no-show(s), ` +
          `${excedidos} auto(s) excedido(s), ${reasignadas} reserva(s) reasignada(s), ` +
          `${afectadas} reserva(s) sin cochera, ${desbloqueadas} cochera(s) desbloqueada(s), ` +
          `${abonosVencidos} abono(s) vencido(s)`,
      );
    }
  } catch (error) {
    console.error('[vencimientos] fallo la revision:', error.message);
  }
}

/**
 * Middleware que corre `revisar` si paso `intervaloMs` desde la ultima vez.
 * Los pedidos que llegan mientras corre esperan esa misma revision en vez de
 * lanzar otra. `revisar` no debe tirar error (lo loguea y el pedido sigue).
 */
export function crearRegularizador({ revisar, intervaloMs = INTERVALO_MS, ahora = Date.now }) {
  let ultimaRevision = -Infinity;
  let enCurso = null;

  return async (req, _res, next) => {
    if (!config.vencimientos.habilitados || req.path === '/health') return next();

    if (!enCurso && ahora() - ultimaRevision >= intervaloMs) {
      ultimaRevision = ahora();
      enCurso = revisar().finally(() => {
        enCurso = null;
      });
    }
    if (enCurso) await enCurso;
    return next();
  };
}

export const regularizarVencimientos = crearRegularizador({ revisar });
