// Codigo de acceso de la reserva: reglas puras de formato. No usa la API ni la base.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { normalizarCodigo } from '../src/utils/codigoAcceso.js';

describe('normalizarCodigo', () => {
  test('acepta el codigo tal cual', () => {
    assert.equal(normalizarCodigo('K7MQ2XTR'), 'K7MQ2XTR');
  });

  test('ignora guion, espacios y minusculas', () => {
    assert.equal(normalizarCodigo(' k7mq-2xtr '), 'K7MQ2XTR');
    assert.equal(normalizarCodigo('k7mq 2xtr'), 'K7MQ2XTR');
  });

  test('rechaza caracteres ambiguos que no estan en el alfabeto', () => {
    for (const ambiguo of ['0', 'O', '1', 'I', 'L']) {
      assert.equal(normalizarCodigo(`K7MQ2XT${ambiguo}`), null, ambiguo);
    }
  });

  test('rechaza largos distintos de 8 y valores que no son texto', () => {
    assert.equal(normalizarCodigo('K7MQ2XT'), null);
    assert.equal(normalizarCodigo('K7MQ2XTRR'), null);
    assert.equal(normalizarCodigo("' OR 1=1"), null);
    assert.equal(normalizarCodigo(null), null);
    assert.equal(normalizarCodigo(12345678), null);
  });
});
