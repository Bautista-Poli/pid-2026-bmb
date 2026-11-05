// Fragmentos SQL compartidos para elegir cocheras (utils/solapamiento.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cocheraReservable } from '../src/utils/solapamiento.js';

test('cocheraReservable: activa, sin bloquear y no inactiva', () => {
  assert.equal(cocheraReservable('ct'), "ct.activo AND NOT ct.bloqueada AND ct.estado_actual <> 'INACTIVA'");
  assert.equal(cocheraReservable(), "c.activo AND NOT c.bloqueada AND c.estado_actual <> 'INACTIVA'");
});
