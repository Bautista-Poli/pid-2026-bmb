// Turnos de los abonos: regla pura de "la reserva cae dentro del turno".
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { instanteLocal } from '../src/utils/horario.js';
import { motivoFueraDeTurno } from '../src/utils/turnos.js';

const dia = '2026-10-14';
const en = (desde, hasta) => [instanteLocal(dia, desde), instanteLocal(dia, hasta)];

describe('motivoFueraDeTurno', () => {
  test('dentro del turno, incluidos los bordes', () => {
    assert.equal(motivoFueraDeTurno('MANANA', ...en('08:00', '10:00')), null);
    assert.equal(motivoFueraDeTurno('MANANA', ...en('06:00', '12:00')), null);
    assert.equal(motivoFueraDeTurno('TARDE', ...en('12:00', '13:00')), null);
  });

  test('la noche termina a la medianoche', () => {
    const inicio = instanteLocal(dia, '22:00');
    const medianoche = instanteLocal('2026-10-15', '00:00');
    assert.equal(motivoFueraDeTurno('NOCHE', inicio, medianoche), null);
  });

  test('empieza antes o termina despues del turno', () => {
    assert.match(motivoFueraDeTurno('MANANA', ...en('05:00', '07:00')), /turno manana \(06:00 a 12:00\)/);
    assert.match(motivoFueraDeTurno('MANANA', ...en('11:00', '13:00')), /turno manana/);
    assert.match(motivoFueraDeTurno('TARDE', ...en('10:00', '11:00')), /turno tarde/);
  });

  test('no puede pasar al dia siguiente', () => {
    const inicio = instanteLocal(dia, '23:00');
    const otroDia = instanteLocal('2026-10-15', '01:00');
    assert.match(motivoFueraDeTurno('NOCHE', inicio, otroDia), /mismo dia/);
  });
});
