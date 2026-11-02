// Fotos como clips de la línea principal: cableado en vista previa, selector y exportación. La prueba con navegador (Chromium simulado) está aparte. — Claude
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { exportPlan, drawFrame, imageEl } from '../export.mjs';
import { clipAt } from '../timeline.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tpl = read('../template.html'), dist = read('../dist/agentcut.html'), exp = read('../export.mjs'), prompt = read('../prompt.mjs');

const proj = () => {
  let p = createProject({ assets: [{ id: 'a1', duration: 10, name: 'v.mp4' }, { id: 'a2', duration: 3600, name: 'f.jpg', kind: 'image' }] });
  return applyBatch(p, [{ op: 'add_clip', asset_id: 'a1' }, { op: 'add_photo_clip', asset_id: 'a2', start: 10, duration: 4 }, { op: 'add_photo_clip', asset_id: 'a2', start: 16, duration: 2 }]).project;
};
test('el plan de exportación pone cada foto como un paso de su duración y deja el hueco entre fotos', () => {
  const pl = exportPlan(proj());
  assert.deepEqual(pl.segments.map((s) => [s.type, s.dur]), [['clip', 10], ['clip', 4], ['gap', 2], ['clip', 2]]);
  assert.equal(pl.total, 18);
});
test('clipAt encuentra la foto en su instante', () => {
  const p = proj(); assert.equal(clipAt(p, 11).clip.asset_id, 'a2'); assert.equal(clipAt(p, 5).clip.asset_id, 'a1'); assert.equal(clipAt(p, 14.5), null);
});
test('drawFrame dibuja una foto del video principal (con la interfaz mínima de imagen) centrada sobre negro', () => {
  const calls = []; const g = new Proxy({}, { get: (_, k) => (...a) => { calls.push([k, ...a]); }, set: () => true });
  const el = { videoWidth: 1200, videoHeight: 800 };           // lo que expone imageEl() de una foto
  drawFrame(g, 320, 568, el, proj(), 11, []);
  const di = calls.find((c) => c[0] === 'drawImage'); assert.ok(di, 'se dibujó la foto');
  assert.equal(di[1], el); assert.ok(di[4] <= 320 + 1e-6 && di[5] > 0, 'cabe en el cuadro'); assert.ok(Math.abs(di[4] / di[5] - 1.5) < 1e-6, 'conserva su proporción 3:2');
});
test('imageEl da a una imagen la interfaz de un video (videoWidth/currentTime/play)', () => {
  const im = imageEl({ naturalWidth: 640, naturalHeight: 480 }); assert.equal(im.videoWidth, 640); assert.equal(im.videoHeight, 480); assert.equal(im.paused, true);
});
test('plantilla y archivo final: selector con fotos, clip con operación nueva, vista previa y reproducción sin <video>', () => {
  for (const [n, h] of [['plantilla', tpl], ['dist', dist]]) {
    assert.match(h, /id="file" type="file" accept="video\/\*,image\/\*" multiple/, n + ': el selector Video acepta fotos');
    assert.match(h, /op: 'add_photo_clip', asset_id: id, start: round2\(start\), duration: PHOTO_SECONDS/, n + ': las fotos entran con add_photo_clip');
    assert.match(h, /const isPhoto = /, n); assert.match(h, /function photoOf\(c\)/, n); assert.match(h, /function makePhotoThumb\(id\)/, n);
    assert.match(h, /if \(hit && isPhoto\(hit\.clip\)\) \{ \$\('v'\)\.pause\(\); photoOf\(hit\.clip\); \}/, n + ': showFrame no manda una foto al <video>');
    assert.match(h, /if \(isPhoto\(hit\.clip\)\) \{ +\/\/ foto: no hay <video>/, n + ': la reproducción corre con reloj propio en una foto');
    assert.match(h, /if \(first && media\[added\[0\]\]\.kind !== 'image'\) useAsset/, n + ': useAsset no recibe fotos');
    assert.match(h, /!isPhoto\(first\)\) useAsset/, n + ': al reabrir un proyecto tampoco');
    assert.ok(!/window\.prompt/.test(h), n);
  }
});
test('la exportación tiene su rama de foto y libera sus elementos', () => {
  assert.match(exp, /if \(m\.kind === 'image'\) \{ +\/\/ foto \(o GIF\) en la línea principal/); assert.match(exp, /photos\.forEach\(\(el\) =>/);
  assert.match(exp, /firstVideo/, 'el cuadro «original» sigue al primer VIDEO');
});
test('la IA conoce add_photo_clip en el prompt copiable', () => { assert.match(prompt, /add_photo_clip/); });
