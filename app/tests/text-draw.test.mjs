// Exportación: los textos se dibujan arriba, al centro o abajo, con su tamaño, color y caja de fondo. — Claude
import test from 'node:test'; import assert from 'node:assert/strict';
import { drawTexts } from '../export.mjs';

const fake = () => {
  const g = { calls: [], font: '', fillStyle: '', strokeStyle: '', lineWidth: 0 };
  g.measureText = (s) => ({ width: s.length * parseFloat(/(\d+(\.\d+)?)px/.exec(g.font)[1]) * 0.55 });
  for (const m of ['beginPath', 'fill', 'rect']) g[m] = (...a) => g.calls.push([m, ...a]);
  g.roundRect = (...a) => g.calls.push(['roundRect', g.fillStyle, ...a]);
  g.fillText = (t, x, y) => g.calls.push(['fillText', t, x, y, g.fillStyle, g.font]); g.strokeText = (t, x, y) => g.calls.push(['strokeText', t, x, y]);
  return g;
};
const W = 1080, H = 1920, ys = (g) => Object.fromEntries(g.calls.filter((c) => c[0] === 'fillText').map((c) => [c[1], c[3]]));

test('sin estilo se ve como siempre: abajo, blanco, sin caja', () => {
  const g = fake(); drawTexts(g, [{ id: 't1', text: 'Hola', start: 0, end: 2 }], W, H);
  const ft = g.calls.find((c) => c[0] === 'fillText'); assert.equal(ft[4], '#ffffff'); assert.ok(ft[3] > H * 0.75 && ft[3] < H * 0.92, 'abajo: y=' + ft[3]);
  assert.ok(!g.calls.some((c) => c[0] === 'roundRect' || c[0] === 'rect'), 'sin caja'); assert.ok(g.calls.some((c) => c[0] === 'strokeText'), 'con contorno');
});
test('arriba < centro < abajo, y cada uno en su zona', () => {
  const g = fake(); drawTexts(g, [{ id: 'a', text: 'ARRIBA', pos: 'top' }, { id: 'b', text: 'CENTRO', pos: 'middle' }, { id: 'c', text: 'ABAJO' }], W, H);
  const y = ys(g); assert.ok(y.ARRIBA < H * 0.2, 'arriba ' + y.ARRIBA); assert.ok(Math.abs(y.CENTRO - H / 2) < H * 0.05, 'centro ' + y.CENTRO); assert.ok(y.ABAJO > H * 0.75, 'abajo ' + y.ABAJO);
});
test('la caja de fondo se dibuja detrás del texto, con el color pedido, y sin contorno', () => {
  const g = fake(); drawTexts(g, [{ id: 'a', text: 'Y DICIÉNDOLE', pos: 'middle', size: 'l', color: '#ffd24a', box: '#000000' }], W, H);
  const i = g.calls.findIndex((c) => c[0] === 'roundRect'), j = g.calls.findIndex((c) => c[0] === 'fillText'); assert.ok(i >= 0 && i < j, 'primero la caja, luego el texto');
  assert.equal(g.calls[i][1], '#000000'); assert.equal(g.calls[j][4], '#ffd24a'); assert.ok(!g.calls.some((c) => c[0] === 'strokeText'), 'con caja no hay contorno');
  const [, , bx, by, bw, bh] = g.calls[i]; assert.ok(bx > 0 && bx + bw < W && by > 0 && by + bh < H, 'la caja cabe en el cuadro'); assert.ok(g.calls[j][3] > by && g.calls[j][3] < by + bh, 'el texto cae dentro de la caja');
});
test('el tamaño cambia la letra: enorme > grande > mediano > chico', () => {
  const sz = (size) => { const g = fake(); drawTexts(g, [{ id: 'a', text: 'x', size }], W, H); return parseFloat(/(\d+)px/.exec(g.calls.find((c) => c[0] === 'fillText')[5])[1]); };
  assert.ok(sz('s') < sz('m') && sz('m') < sz('l') && sz('l') < sz('xl'));
});
test('varios textos en la misma zona no se pisan y un texto largo se parte en líneas', () => {
  const g = fake(); drawTexts(g, [{ id: 'a', text: 'uno', pos: 'top' }, { id: 'b', text: 'dos', pos: 'top' }, { id: 'c', text: 'palabra '.repeat(30).trim(), pos: 'bottom' }], W, H);
  const y = ys(g); assert.ok(y.dos - y.uno > 40, 'el segundo queda debajo del primero');
  const lines = g.calls.filter((c) => c[0] === 'fillText' && c[1].startsWith('palabra')); assert.ok(lines.length > 1, 'se partió en líneas'); assert.ok(Math.max(...lines.map((l) => l[3])) < H, 'cabe en el cuadro');
});
