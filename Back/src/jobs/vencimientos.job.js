// Corre las tareas automaticas cada minuto:
// - reserva.service.js: PENDIENTE sin confirmar que ya empezo -> CANCELADA, y
//   CONFIRMADA sin ingreso pasada TOLERANCIA_NO_SHOW_MS -> NO_SHOW.
// - incidencia.service.js: ACTIVA que se paso de su fin sin egreso -> incidencia
//   AUTO_EXCEDIDO (la reserva NO se cierra: la cochera queda bloqueada hasta el
//   egreso), y las reservas siguientes de esa cochera se reasignan a otra o,
//   sin alternativa, quedan con una incidencia RESERVA_AFECTADA.
// - cochera.service.js: cocheras bloqueadas con `bloqueada_hasta` vencido se desbloquean solas.
// - abono.service.js: abonos VIGENTES con `hasta` vencido -> VENCIDO.
//
// Solo lo arranca src/index.js (el proceso real del servidor). Las pruebas
// levantan la app con app.listen() directamente y nunca importan este
// archivo, asi que no corre durante `npm test`.
import cron from 'node-cron';

import { vencerAbonos } from '../services/abono.service.js';
import { desbloquearVencidas } from '../services/cochera.service.js';
import { detectarExcedidos, protegerReservasSiguientes } from '../services/incidencia.service.js';
import { vencerAusentes, vencerPendientesSinConfirmar } from '../services/reserva.service.js';

let tarea;

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

export function iniciarVencimientosAutomaticos() {
  tarea = cron.schedule('* * * * *', revisar);
  return tarea;
}

export function detenerVencimientosAutomaticos() {
  tarea?.stop();
  tarea = undefined;
}
