// Exportación más robusta: tamaño/calidad según duración, esperas con tiempo límite y cancelables. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exportBitrate, exportSizeMB, waitEvent, EXPORT_BPS, EXPORT_MIN_BPS, STALL_SECONDS } from '../export.mjs';

test('bitrate: pleno hasta 2 min, baja después y nunca menos de 3 Mbps', () => {
  assert.equal(exportBitrate(10), EXPORT_BPS); assert.equal(exportBitrate(120), EXPORT_BPS);
  assert.equal(exportBitrate(240), 4_000_000); assert.equal(exportBitrate(3600), EXPORT_MIN_BPS);
  assert.equal(exportBitrate(0), EXPORT_BPS); assert.equal(exportBitrate(NaN), EXPORT_BPS);
});
test('el tamaño estimado nunca pasa de ~120 MB hasta 5 min y crece con la duración corta', () => {
  assert.equal(exportSizeMB(10), 10); assert.equal(exportSizeMB(120), 120); assert.ok(exportSizeMB(300) <= 120 + 1, String(exportSizeMB(300)));
  assert.equal(exportSizeMB(0), 1);
});
const fake = () => { const l = {}; return { addEventListener: (e, f) => { (l[e] ||= new Set()).add(f); }, removeEventListener: (e, f) => l[e] && l[e].delete(f), fire: (e) => [...(l[e] || [])].forEach((f) => f()), n: () => Object.values(l).reduce((a, s) => a + s.size, 0) }; };
test('waitEvent: resuelve con el evento y limpia sus oyentes', async () => {
  const el = fake(); const p = waitEvent(el, 'seeked', { ms: 1000 }); el.fire('seeked'); await p; assert.equal(el.n(), 0);
});
test('waitEvent: error del medio → mensaje claro; tiempo límite → mensaje claro', async () => {
  const el = fake(); const p = waitEvent(el, 'loadedmetadata', { ms: 1000, what: 'Un video' }); el.fire('error'); await assert.rejects(p, /No se pudo leer un video para exportar/); assert.equal(el.n(), 0);
  await assert.rejects(waitEvent(fake(), 'seeked', { ms: 30, what: 'Un video' }), /tardó demasiado en responder \(más de 0 s\)/);
});
test('waitEvent: cancelar mientras espera termina la espera (antes quedaba colgada)', async () => {
  let c = false; const el = fake(); const p = waitEvent(el, 'seeked', { ms: 5000, isCancelled: () => c }); setTimeout(() => { c = true; }, 50); const t = Date.now(); await p; assert.ok(Date.now() - t < 1500); assert.equal(el.n(), 0);
});
test('recordProject: avisa si la app pasa a segundo plano, se traba un video o falla la grabación', () => {
  const src = readFileSync(new URL('../export.mjs', import.meta.url), 'utf8');
  assert.match(src, /addEventListener\('visibilitychange', onVis\)/); assert.match(src, /removeEventListener\('visibilitychange', onVis\)/); assert.match(src, /if \(interrupted\) return \{ interrupted: true \}/);
  assert.match(src, /El video se trabó y no avanzó/); assert.match(src, /rec\.onerror/); assert.match(src, /No se grabó nada/);
  assert.ok(STALL_SECONDS >= 5 && STALL_SECONDS <= 15);
});
test('la plantilla y el archivo final muestran el tamaño, el aviso de video largo y el de interrupción', () => {
  for (const f of ['../template.html', '../dist/agentcut.html']) { const h = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(h, /id="expLong"/, f); assert.match(h, /exportSizeMB\(plan\.total\)/, f); assert.match(h, /if \(r\.interrupted\)/, f); }
});

test('source video shortfall uses source out and real video duration, converting via playback speed',async()=>{
  const { videoSourceShortfall } = await import('../export.mjs');
  assert.equal(videoSourceShortfall({in:0,out:4,speed:1},2.75),1.25);
  assert.equal(videoSourceShortfall({in:2,out:8,speed:2},5),1.5);
  assert.equal(videoSourceShortfall({in:0,out:3,speed:1},2.96),0);
  assert.equal(videoSourceShortfall({in:0,out:3,speed:1},Infinity),0);
});

test('exporter rejects source EOF and out-of-range clips instead of writing truncated montage',()=>{
  const src=readFileSync(new URL('../export.mjs',import.meta.url),'utf8');
  assert.match(src,/const missingVideoSeconds = videoSourceShortfall\(c, ev\.duration\)/);
  assert.match(src,/if \(ev\.ended\) \{/);
  assert.match(src,/El video original termina antes del final elegido/);
});


test('long export estimator flags memory exposure without claiming mobile hardware validation',async()=>{
  const {exportMemoryRisk,exportPlan,validateMainVideoExport}=await import('../export.mjs');
  assert.deepEqual(exportMemoryRisk(300),{estimatedMB:120,level:'normal',bufferedUntilComplete:true});
  assert.equal(exportMemoryRisk(1200).level,'elevated');
  assert.equal(exportMemoryRisk(1200).estimatedMB,450);
  assert.equal(exportMemoryRisk(3600).level,'critical');
  assert.equal(exportMemoryRisk(3600).estimatedMB,1350);
  const twelveHours=1440*30;
  assert.equal(exportMemoryRisk(twelveHours).estimatedMB,16200);
  assert.equal(exportMemoryRisk(twelveHours).level,'critical');
  const clips=Array.from({length:1440},(_,i)=>({
    id:'part-'+(i+1),asset_id:'rayban-'+(i+1),start:i*30,in:0,out:30
  }));
  assert.deepEqual(validateMainVideoExport({clips}),{ok:true});
  const plan=exportPlan({clips});
  assert.equal(plan.segments.length,1440);
  assert.equal(plan.total,twelveHours);
  // Scheduling and capacity checks are pure data tests, never a 12h playback claim.
});

test('the existing export dialog discloses in-memory buffering risk on both source and built HTML',()=>{
  for(const file of ['../template.html','../dist/agentcut.html']){
    const html=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(html,/exportMemoryRisk\(plan\.total\)/);
    assert.match(html,/Este motor acumula datos en memoria/);
    assert.match(html,/Los originales no se borran/);
  }
});
