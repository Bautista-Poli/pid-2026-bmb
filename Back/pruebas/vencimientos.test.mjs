// Revision de vencimientos al usar la app: corre como mucho una vez por
// intervalo, los pedidos simultaneos esperan la misma revision y no corre si
// esta apagada o para /health. Sin base: `revisar` y el reloj son de mentira.
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { crearRegularizador } from '../src/middlewares/vencimientos.js';

const INTERVALO = 60_000;

afterEach(() => {
  process.env.VENCIMIENTOS_ENABLED = 'true';
});

/** Regularizador con un reloj que se adelanta a mano y un contador de revisiones. */
function escenario({ demora = 0 } = {}) {
  let reloj = 0;
  const contador = { revisiones: 0 };
  const middleware = crearRegularizador({
    intervaloMs: INTERVALO,
    ahora: () => reloj,
    revisar: async () => {
      contador.revisiones += 1;
      if (demora) await new Promise((resolver) => setTimeout(resolver, demora));
      contador.terminadas = (contador.terminadas ?? 0) + 1;
    },
  });
  /** Atiende un pedido y devuelve cuantas revisiones habian terminado al llegar a next(). */
  const pedir = (path = '/reservas') =>
    new Promise((resolver) => {
      middleware({ path }, {}, () => resolver(contador.terminadas ?? 0));
    });
  const adelantar = (ms) => {
    reloj += ms;
  };
  return { contador, pedir, adelantar };
}

describe('revision de vencimientos al usar', () => {
  test('dos pedidos dentro del intervalo revisan una sola vez', async () => {
    process.env.VENCIMIENTOS_ENABLED = 'true';
    const { contador, pedir, adelantar } = escenario();
    await pedir();
    adelantar(INTERVALO - 1);
    await pedir();
    assert.equal(contador.revisiones, 1);
  });

  test('pasado el intervalo vuelve a revisar', async () => {
    process.env.VENCIMIENTOS_ENABLED = 'true';
    const { contador, pedir, adelantar } = escenario();
    await pedir();
    adelantar(INTERVALO);
    await pedir();
    assert.equal(contador.revisiones, 2);
  });

  test('los pedidos simultaneos esperan la misma revision', async () => {
    process.env.VENCIMIENTOS_ENABLED = 'true';
    const { contador, pedir } = escenario({ demora: 20 });
    const terminadasAlAtender = await Promise.all([pedir(), pedir(), pedir()]);
    assert.equal(contador.revisiones, 1);
    assert.deepEqual(terminadasAlAtender, [1, 1, 1]);
  });

  test('apagada por configuracion no revisa', async () => {
    process.env.VENCIMIENTOS_ENABLED = 'false';
    const { contador, pedir } = escenario();
    await pedir();
    assert.equal(contador.revisiones, 0);
  });

  test('/health no revisa', async () => {
    process.env.VENCIMIENTOS_ENABLED = 'true';
    const { contador, pedir } = escenario();
    await pedir('/health');
    assert.equal(contador.revisiones, 0);
  });
});
