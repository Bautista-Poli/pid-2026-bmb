// Corre las transiciones automaticas cada minuto:
// - reserva.service.js: PENDIENTE sin confirmar que ya empezo -> CANCELADA,
//   CONFIRMADA sin ingreso pasada TOLERANCIA_NO_SHOW_MS -> NO_SHOW, y
//   ACTIVA sin egreso vencida hace mas de MARGEN_CIERRE_AUTOMATICO_MS -> FINALIZADA.
// - cochera.service.js: cocheras bloqueadas con `bloqueada_hasta` vencido se desbloquean solas.
// - abono.service.js: abonos VIGENTES con `hasta` vencido -> VENCIDO.
//
// Solo lo arranca src/index.js (el proceso real del servidor). Las pruebas
// levantan la app con app.listen() directamente y nunca importan este
// archivo, asi que no corre durante `npm test`.
import cron from 'node-cron';

import { vencerAbonos } from '../services/abono.service.js';
import { desbloquearVencidas } from '../services/cochera.service.js';
import {
  vencerActivasSinEgreso,
  vencerNoPresentadas,
  vencerPendientesSinConfirmar,
} from '../services/reserva.service.js';

let tarea;

async function revisar() {
  try {
    const canceladas = await vencerPendientesSinConfirmar();
    const noPresentadas = await vencerNoPresentadas();
    const finalizadas = await vencerActivasSinEgreso();
    const desbloqueadas = await desbloquearVencidas();
    const abonosVencidos = await vencerAbonos();
    if (canceladas || noPresentadas || finalizadas || desbloqueadas || abonosVencidos) {
      console.log(
        `[vencimientos] ${canceladas} pendiente(s) cancelada(s), ${noPresentadas} no-show(s), ${finalizadas} activa(s) finalizada(s), ` +
          `${desbloqueadas} cochera(s) desbloqueada(s), ${abonosVencidos} abono(s) vencido(s)`,
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
