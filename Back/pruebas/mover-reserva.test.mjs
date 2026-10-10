// Hora a la que se mueve una reserva con npm run db:mover-reserva. No usa la API ni la base.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parsearInicio } from '../src/utils/moverReserva.js';

// 10/10/2026 12:23:45 en Argentina.
const AHORA = new Date('2026-10-10T15:23:45.678Z');

describe('parsearInicio', () => {
  test('"ahora" es este minuto, sin segundos', () => {
    assert.equal(parsearInicio('ahora', AHORA).toISOString(), '2026-10-10T15:23:00.000Z');
    assert.equal(parsearInicio(' AHORA ', AHORA).toISOString(), '2026-10-10T15:23:00.000Z');
  });

  test('HH:MM es hoy a esa hora de Argentina', () => {
    assert.equal(parsearInicio('12:00', AHORA).toISOString(), '2026-10-10T15:00:00.000Z');
    assert.equal(parsearInicio('9:30', AHORA).toISOString(), '2026-10-10T12:30:00.000Z');
  });

  test('"hoy" es el dia de Argentina aunque en UTC ya sea manana', () => {
    // 10/10 22:30 en Argentina = 11/10 01:30 UTC.
    const noche = new Date('2026-10-11T01:30:00.000Z');
    assert.equal(parsearInicio('23:00', noche).toISOString(), '2026-10-11T02:00:00.000Z');
  });

  test('acepta fecha y hora completas', () => {
    assert.equal(parsearInicio('2026-10-12 08:00', AHORA).toISOString(), '2026-10-12T11:00:00.000Z');
    assert.equal(parsearInicio('2026-10-12T21:15', AHORA).toISOString(), '2026-10-13T00:15:00.000Z');
  });

  test('rechaza lo que no entiende', () => {
    for (const malo of ['', 'manana', '24:00', '12:60', '12', '2026-02-30 10:00', '2026-10-12', null]) {
      assert.equal(parsearInicio(malo, AHORA), null, String(malo));
    }
  });
});
