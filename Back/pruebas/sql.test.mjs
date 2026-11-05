// Helpers para armar SQL (utils/sql.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { armarSet } from '../src/utils/sql.js';

test('armarSet: solo los campos que vinieron, numerados despues de los parametros que ya hay', () => {
  const parametros = ['x'];
  const asignaciones = armarSet(['nombre', 'sector', 'cubierta'], { nombre: 'A', sector: null, otro: 1 }, parametros);
  assert.deepEqual(asignaciones, ['nombre = $2', 'sector = $3']);
  assert.deepEqual(parametros, ['x', 'A', null]);
});
