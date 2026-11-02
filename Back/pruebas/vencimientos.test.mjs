// Vencimientos a demanda: la revision corre con los pedidos que llegan (como
// mucho una vez por minuto), no con un reloj. Asi, sin nadie usando la app, la
// base no se consulta y Neon la puede suspender. Estas pruebas no usan la base.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { crearDisparador, middlewareVencimientos } from '../src/jobs/vencimientos.job.js';

/** Reloj falso y una revision que cuenta cuantas veces corrio. */
function escenario({ demora = 0 } = {}) {
  let ahora = 1_000_000;
  let corridas = 0;
  let terminar;
  const revisar = () => {
    corridas += 1;
    return demora ? new Promise((resolver) => (terminar = resolver)) : Promise.resolve();
  };
  const disparar = crearDisparador({ revisar, intervaloMs: 60_000, reloj: () => ahora });
  return {
    disparar,
    corridas: () => corridas,
    avanzar: (ms) => (ahora += ms),
    terminar: () => terminar?.(),
  };
}

describe('crearDisparador', () => {
  test('el primer pedido revisa y los siguientes del mismo minuto no', async () => {
    const e = escenario();

    await e.disparar();
    await e.disparar();
    e.avanzar(59_000);
    await e.disparar();

    assert.equal(e.corridas(), 1);
  });

  test('pasado el minuto vuelve a revisar', async () => {
    const e = escenario();

    await e.disparar();
    e.avanzar(60_000);
    await e.disparar();

    assert.equal(e.corridas(), 2);
  });

  test('no arranca otra revision mientras una sigue corriendo', async () => {
    const e = escenario({ demora: 1 });

    const primera = e.disparar();
    e.avanzar(120_000);
    e.disparar();
    assert.equal(e.corridas(), 1);

    e.terminar();
    await primera;
    const segunda = e.disparar();
    assert.equal(e.corridas(), 2);
    e.terminar();
    await segunda;
  });

  test('si la revision falla, el pedido sigue y se reintenta al minuto siguiente', async () => {
    let ahora = 0;
    let corridas = 0;
    const disparar = crearDisparador({
      revisar: async () => {
        corridas += 1;
        throw new Error('base caida');
      },
      intervaloMs: 60_000,
      reloj: () => ahora,
    });

    await disparar();
    ahora += 60_000;
    await disparar();

    assert.equal(corridas, 2);
  });
});

describe('middlewareVencimientos', () => {
  test('cada pedido dispara la revision y sigue de largo', () => {
    let disparos = 0;
    let siguio = false;
    const middleware = middlewareVencimientos(() => {
      disparos += 1;
    });

    middleware({ path: '/estacionamientos' }, {}, () => (siguio = true));

    assert.equal(disparos, 1);
    assert.equal(siguio, true);
  });

  test('el chequeo de salud de Railway no despierta la base', () => {
    let disparos = 0;
    const middleware = middlewareVencimientos(() => {
      disparos += 1;
    });

    middleware({ path: '/health' }, {}, () => {});

    assert.equal(disparos, 0);
  });
});
