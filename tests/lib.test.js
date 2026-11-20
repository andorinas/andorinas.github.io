// Lectura de números tipeados en los formularios (cotización, avance, pesos, TC de cancelación).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecimal } from '../shared/numeros.js';

test('parseDecimal acepta formatos argentinos y rechaza texto', () => {
  assert.equal(parseDecimal('1.580,00'), 1580);
  assert.equal(parseDecimal('1580'), 1580);
  assert.equal(parseDecimal('1.550'), 1550);
  assert.equal(parseDecimal('35'), 35);
  assert.equal(parseDecimal('12,5'), 12.5);
  assert.equal(parseDecimal('12.5'), 12.5);
  assert.equal(parseDecimal('ARS 1.300,50'), 1300.5);
  assert.equal(parseDecimal('40 %'), 40);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('abc'), null);
  assert.equal(parseDecimal('-5'), null);
});
