import test from 'node:test'; import assert from 'node:assert/strict';
import { tpWords, tpSeconds, tpPxPerSecond, tpClean, TP_SPEEDS } from '../teleprompter.mjs';
test('cuenta palabras y segundos de lectura', () => {
  assert.equal(tpWords('  Hola   mundo\nbonito '), 3); assert.equal(tpWords(''), 0); assert.equal(tpWords(null), 0);
  assert.equal(tpSeconds('uno dos tres cuatro cinco seis siete', 140), 3); assert.equal(tpSeconds('a '.repeat(140), 140), 60); assert.equal(tpSeconds('hola', 0), 0);
});
test('velocidad de desplazamiento: más rápido = más píxeles por segundo; sin datos = 0', () => {
  const slow = tpPxPerSecond(TP_SPEEDS.slow, 3000, 100), fast = tpPxPerSecond(TP_SPEEDS.fast, 3000, 100);
  assert.ok(fast > slow && slow > 0); assert.equal(Math.round(tpPxPerSecond(120, 1200, 120)), 20);
  assert.equal(tpPxPerSecond(0, 1000, 10), 0); assert.equal(tpPxPerSecond(120, 0, 10), 0); assert.equal(tpPxPerSecond(120, 1000, 0), 0); assert.equal(tpPxPerSecond(NaN, 1000, 10), 0);
});
test('limpia el texto sin perder párrafos', () => { assert.equal(tpClean('  Hola \r\n\r\n\r\n\r\nAdiós  '), 'Hola\n\nAdiós'); assert.equal(tpClean(undefined), ''); });
