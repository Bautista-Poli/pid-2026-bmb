// Tareas automaticas (las revisa `revisar`):
// - reserva.service.js: PENDIENTE sin confirmar que ya empezo -> CANCELADA, y
//   CONFIRMADA sin ingreso pasada TOLERANCIA_NO_SHOW_MS -> NO_SHOW.
// - incidencia.service.js: ACTIVA que se paso de su fin sin egreso -> incidencia
//   AUTO_EXCEDIDO (la reserva NO se cierra: la cochera queda bloqueada hasta el
//   egreso), y las reservas siguientes de esa cochera se reasignan a otra o,
//   sin alternativa, quedan con una incidencia RESERVA_AFECTADA.
// - cochera.service.js: cocheras bloqueadas con `bloqueada_hasta` vencido se desbloquean solas.
// - abono.service.js: abonos VIGENTES con `hasta` vencido -> VENCIDO.
//
// Corren A DEMANDA, no con un reloj: cada pedido a la API dispara la revision,
// como mucho una vez por minuto. Con un reloj cada minuto la base nunca quedaba
// sin consultas, Neon no la suspendia y se agotaba la cuota gratis de computo.
// Asi, mientras alguien usa la app el estado esta al dia al minuto, y sin nadie
// la base duerme. Lo que vencio mientras tanto se pone al dia con el primer
// pedido (no hay mails ni avisos que dependan de la hora exacta). La
// disponibilidad y el bloqueo por auto excedido no dependen de esto: se
// calculan en cada consulta.
//
// Solo lo activa src/index.js (el proceso real del servidor). Las pruebas
// levantan la app sin llamar a `activarVencimientosADemanda`, asi que durante
// `npm test` el middleware no hace nada.
import { vencerAbonos } from '../services/abono.service.js';
import { desbloquearVencidas } from '../services/cochera.service.js';
import { detectarExcedidos, protegerReservasSiguientes } from '../services/incidencia.service.js';
import { vencerAusentes, vencerPendientesSinConfirmar } from '../services/reserva.service.js';

export const INTERVALO_MINIMO_MS = 60_000;

async function revisar() {
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
}

/**
 * Devuelve una funcion que corre `revisar` si paso al menos `intervaloMs` desde
 * la ultima vez y no hay otra corriendo. Devuelve la promesa de la revision (o
 * una ya resuelta si no tocaba); nunca rechaza: un fallo se loguea y se
 * reintenta en el proximo intervalo.
 */
export function crearDisparador({ revisar: tarea = revisar, intervaloMs = INTERVALO_MINIMO_MS, reloj = Date.now } = {}) {
  let ultima = -Infinity;
  let enCurso = null;

  return function disparar() {
    if (enCurso || reloj() - ultima < intervaloMs) return enCurso ?? Promise.resolve();
    ultima = reloj();
    // La revision arranca en el acto (no en el proximo tick): un segundo pedido
    // que llegue enseguida ya la encuentra en curso.
    enCurso = (async () => {
      try {
        await tarea();
      } catch (error) {
        console.error('[vencimientos] fallo la revision:', error.message);
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  };
}

/**
 * Middleware de la API: cada pedido dispara la revision sin esperarla (no
 * demora la respuesta). El chequeo de salud no cuenta: lo hace Railway y no
 * tiene que despertar la base.
 */
export function middlewareVencimientos(disparar) {
  return (req, _res, next) => {
    if (req.path !== '/health') disparar();
    next();
  };
}

let disparador = null;

/** Lo llama src/index.js al arrancar el servidor real. */
export function activarVencimientosADemanda() {
  disparador = crearDisparador();
}

export function desactivarVencimientosADemanda() {
  disparador = null;
}

/** Lo que monta app.js: no hace nada hasta que se activa (asi las pruebas no lo corren). */
export const vencimientosADemanda = middlewareVencimientos(() => disparador?.());
