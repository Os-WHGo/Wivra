// W97/W102 (Claude): two files are "the same" only when their bytes are equal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sameBytes } from '../file-identity.mjs';

const bytes = (n, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 0xff);

test('same name, size and date are not enough: different bytes are different files', async () => {
  const a = new File([bytes(5000)], 'IMG_0001.MOV', { lastModified: 1700000000000 });
  const b = new File([bytes(5000, 2)], 'IMG_0001.MOV', { lastModified: 1700000000000 });
  assert.equal(await sameBytes(a, b, { chunk: 1024 }), false);
});

test('identical bytes are the same file, even with another name or date', async () => {
  const a = new File([bytes(5000)], 'a.mov', { lastModified: 1 }), b = new File([bytes(5000)], 'b.mov', { lastModified: 2 });
  assert.equal(await sameBytes(a, b, { chunk: 1024 }), true);
  assert.equal(await sameBytes(a, a), true);
});

test('a single different byte at the very end is found; sizes must match', async () => {
  const x = bytes(10_000), y = bytes(10_000); y[9_999] ^= 1;
  assert.equal(await sameBytes(new Blob([x]), new Blob([y]), { chunk: 4096 }), false);
  assert.equal(await sameBytes(new Blob([x]), new Blob([x.subarray(0, 9_999)])), false);
  assert.equal(await sameBytes(null, new Blob([x])), false);
});

test('progress is reported and an unreadable file is never "the same"', async () => {
  const seen = [];
  await sameBytes(new Blob([bytes(10_000)]), new Blob([bytes(10_000)]), { chunk: 4096, onProgress: (p) => seen.push(p) });
  assert.deepEqual(seen.map((p) => +p.toFixed(2)), [0.41, 0.82, 1]);
  const broken = { size: 10, slice: () => ({ arrayBuffer: async () => { throw new Error('gone'); } }) };
  assert.equal(await sameBytes(broken, new Blob([bytes(10)])), false);
});

test('cancellation is passed through, not swallowed as "different"', async () => {
  const cancel = () => { throw Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' }); };
  await assert.rejects(sameBytes(new Blob([bytes(100)]), new Blob([bytes(100)]), { alive: cancel }), /CANCELLED/);
});

test('the editor uses the byte comparison for re-imports (W97) and for choosing a file again (W102)', () => {
  const html = readFileSync(new URL('../template.html', import.meta.url), 'utf8');
  const fn = html.split('async function sameFileAsset(f)')[1].split('\n}\n')[0];
  assert.match(fn, /await sameBytes\(k, f/);
  assert.doesNotMatch(fn, /lastModified/);                       // a date is never treated as proof
  assert.match(html, /const again = requireAll \? null : await sameFileAsset\(f\);/);
  const regrant = html.split('function wvAskRegrant(missing) {')[1].split('async function wvLongWindow')[0];
  assert.match(regrant, /await sameBytes\(mediaFiles\[x\.id\], file/);
  const build = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
  assert.match(build, /'\.\/file-identity\.mjs'/);
});
