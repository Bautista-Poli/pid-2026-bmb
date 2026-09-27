// Tarifas por modalidad: reglas puras de duracion, precio y horario de ingreso.
// No usan la API ni la base.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { instanteLocal, motivoIngresoFueraDeHorario } from '../src/utils/horario.js';
import { motivoDuracionInvalida, precioDeReserva } from '../src/utils/tarifas.js';

const inicio = new Date('2026-09-14T13:00:00Z');
const despues = (horas) => new Date(inicio.getTime() + horas * 3_600_000);

const TARIFAS = { tarifa_hora: 1000, tarifa_estadia: 5000, tarifa_jornada: 8000 };
const SOLO_HORA = { tarifa_hora: 1000, tarifa_estadia: null, tarifa_jornada: null };

describe('motivoDuracionInvalida', () => {
  test('la estadia dura exactamente 12 horas', () => {
    assert.equal(motivoDuracionInvalida('ESTADIA', inicio, despues(12)), null);
    assert.match(motivoDuracionInvalida('ESTADIA', inicio, despues(11)), /12 horas/);
    assert.match(motivoDuracionInvalida('ESTADIA', inicio, despues(24)), /12 horas/);
  });

  test('la jornada dura exactamente 24 horas', () => {
    assert.equal(motivoDuracionInvalida('JORNADA', inicio, despues(24)), null);
    assert.match(motivoDuracionInvalida('JORNADA', inicio, despues(12)), /24 horas/);
    assert.match(motivoDuracionInvalida('JORNADA', inicio, despues(48)), /24 horas/);
  });

  test('por hora no impone una duracion', () => {
    assert.equal(motivoDuracionInvalida('HORA', inicio, despues(3)), null);
  });
});

describe('precioDeReserva', () => {
  test('por hora es proporcional a las horas', () => {
    assert.equal(precioDeReserva('HORA', TARIFAS, inicio, despues(2)), 2000);
    assert.equal(precioDeReserva('HORA', TARIFAS, inicio, despues(1.5)), 1500);
  });

  test('estadia y jornada son de precio fijo', () => {
    assert.equal(precioDeReserva('ESTADIA', TARIFAS, inicio, despues(12)), 5000);
    assert.equal(precioDeReserva('JORNADA', TARIFAS, inicio, despues(24)), 8000);
  });

  test('devuelve null si el estacionamiento no ofrece la modalidad', () => {
    assert.equal(precioDeReserva('ESTADIA', SOLO_HORA, inicio, despues(12)), null);
    assert.equal(precioDeReserva('JORNADA', SOLO_HORA, inicio, despues(24)), null);
    const sinHora = { tarifa_hora: null, tarifa_estadia: 5000, tarifa_jornada: null };
    assert.equal(precioDeReserva('HORA', sinHora, inicio, despues(2)), null);
  });

  test('una tarifa en 0 es un precio (gratis), no "no se ofrece"', () => {
    const gratis = { tarifa_hora: 0, tarifa_estadia: null, tarifa_jornada: null };
    assert.equal(precioDeReserva('HORA', gratis, inicio, despues(2)), 0);
  });
});

describe('motivoIngresoFueraDeHorario', () => {
  // 2026-09-14 es lunes (dia_semana 1).
  const horarios = [{ dia_semana: 1, hora_apertura: '08:00:00', hora_cierre: '20:00:00' }];

  test('un ingreso dentro del horario es valido, aunque el bloque siga despues del cierre', () => {
    assert.equal(motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-14', '18:00')), null);
  });

  test('un ingreso despues del cierre o antes de la apertura no es valido', () => {
    assert.match(
      motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-14', '22:00')),
      /fuera del horario/,
    );
    assert.match(
      motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-14', '07:00')),
      /fuera del horario/,
    );
  });

  test('un ingreso justo a la hora de cierre no es valido', () => {
    assert.match(
      motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-14', '20:00')),
      /fuera del horario/,
    );
  });

  test('un dia sin horario cargado esta cerrado', () => {
    assert.match(
      motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-15', '10:00')),
      /no abre/,
    );
  });

  test('sin horarios cargados no se restringe', () => {
    assert.equal(motivoIngresoFueraDeHorario([], instanteLocal('2026-09-14', '03:00')), null);
  });
});
