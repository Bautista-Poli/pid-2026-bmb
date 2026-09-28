// Corre las dos transiciones automaticas de reserva.service.js cada minuto:
// PENDIENTE sin confirmar que ya empezo -> CANCELADA, y ACTIVA sin egreso
// vencida hace mas de MARGEN_CIERRE_AUTOMATICO_MS -> FINALIZADA.
//
// Solo lo arranca src/index.js (el proceso real del servidor). Las pruebas
// levantan la app con app.listen() directamente y nunca importan este
// archivo, asi que no corre durante `npm test`.
import cron from 'node-cron';

import { vencerActivasSinEgreso, vencerPendientesSinConfirmar } from '../services/reserva.service.js';

let tarea;

async function revisar() {
  try {
    const canceladas = await vencerPendientesSinConfirmar();
    const finalizadas = await vencerActivasSinEgreso();
    if (canceladas || finalizadas) {
      console.log(`[vencimientos] ${canceladas} pendiente(s) cancelada(s), ${finalizadas} activa(s) finalizada(s)`);
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
