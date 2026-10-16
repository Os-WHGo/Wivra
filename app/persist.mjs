// Wivra · guardar y reabrir el proyecto en el propio teléfono (IndexedDB). Sin dependencias, sin imports.
// Todo queda en el dispositivo: nada se sube a ningún servidor. — Claude
//
// Qué se guarda: el proyecto (JSON), la lista de archivos (nombre, duración, tamaño) y, si cabe, los archivos mismos.
// Qué NO se guarda: el historial de deshacer (al reabrir se empieza con el historial vacío).
// Si el navegador no deja guardar un archivo (poco espacio), el proyecto igual se guarda y al reabrir pide ese archivo de nuevo.

export const PERSIST_SCHEMA = 'wivra-project';
export const PERSIST_VERSION = 1;

const pzNum = (x) => typeof x === 'number' && Number.isFinite(x);
const PZ_GROUPS = ['clips', 'overlayClips', 'audioClips'];

/** Instantánea serializable. `stored` = ids de archivos que sí están guardados en el teléfono. */
export function makeSnapshot({ project, media = {}, assetSeq = 0, tlTime = 0, stored = [], now = Date.now() }) {
  const ok = new Set(stored);
  const assets = (project.assets || []).map((a) => {
    const m = media[a.id] || {};
    return { id: a.id, name: m.name || a.name || '', duration: a.duration, w: m.w || 0, h: m.h || 0, size: m.size || 0, type: m.type || '', kind: m.kind || '', stored: ok.has(a.id) };
  });
  return { schema: PERSIST_SCHEMA, version: PERSIST_VERSION, savedAt: now, assetSeq, tlTime, project: JSON.parse(JSON.stringify(project)), assets };
}

/**
 * Lee y repara una instantánea (texto o objeto). Nunca lanza.
 * → { ok:true, snapshot, warnings } | { ok:false, errors }
 * Acepta también un proyecto "pelado" de antes (sin schema/version) y le pone lo que falte.
 */
export function readSnapshot(raw) {
  const warnings = [];
  let s = raw;
  if (typeof raw === 'string') { try { s = JSON.parse(raw); } catch { return { ok: false, errors: ['El proyecto guardado está dañado (no es JSON).'] }; } }
  if (!s || typeof s !== 'object') return { ok: false, errors: ['El proyecto guardado está vacío.'] };
  if (s.schema === undefined && Array.isArray(s.clips)) s = { schema: PERSIST_SCHEMA, version: 0, project: s, assets: [] };   // proyecto sin envoltorio
  if (s.schema !== PERSIST_SCHEMA) return { ok: false, errors: ['Este archivo no es un proyecto de Wivra.'] };
  if (!pzNum(s.version) || s.version < 0) return { ok: false, errors: ['El proyecto guardado no dice de qué versión es.'] };
  if (s.version > PERSIST_VERSION) return { ok: false, errors: [`El proyecto es de una versión más nueva (${s.version}). Actualiza la app para abrirlo.`] };
  const src = s.project;
  if (!src || typeof src !== 'object') return { ok: false, errors: ['Al proyecto guardado le falta la línea de tiempo.'] };

  // Migraciones (v0 → v1: faltaban format/overlayClips/audioClips/texts/nextId).
  const p = JSON.parse(JSON.stringify(src));
  p.revision = pzNum(p.revision) ? p.revision : 0;
  p.assets = Array.isArray(p.assets) ? p.assets.filter((a) => a && typeof a.id === 'string' && pzNum(a.duration)) : [];
  const f = p.format && typeof p.format === 'object' ? p.format : {};
  p.format = { aspect: typeof f.aspect === 'string' ? f.aspect : 'original', fit: typeof f.fit === 'string' ? f.fit : 'cover' };
  for (const g of [...PZ_GROUPS, 'texts']) if (!Array.isArray(p[g])) { if (p[g] !== undefined) warnings.push(`Se reparó la lista “${g}”.`); p[g] = []; }

  // Quita clips imposibles (números rotos, fuera de duración, sin archivo conocido) en vez de abrir un proyecto corrupto.
  const dur = new Map(p.assets.map((a) => [a.id, a.duration]));
  for (const g of PZ_GROUPS) {
    p[g] = p[g].filter((c) => {
      const good = c && typeof c.id === 'string' && dur.has(c.asset_id) && pzNum(c.start) && c.start >= 0 && pzNum(c.in) && pzNum(c.out) && c.in >= 0 && c.out > c.in && c.out <= dur.get(c.asset_id) + 0.05;
      if (!good) warnings.push(`Se descartó un clip dañado (${c && c.id ? c.id : '?'}).`);
      return good;
    });
  }
  p.texts = p.texts.filter((t) => { const good = t && typeof t.text === 'string' && pzNum(t.start) && pzNum(t.end) && t.end > t.start; if (!good) warnings.push('Se descartó un texto dañado.'); return good; });

  // nextId siempre mayor que cualquier id usado, para que los clips nuevos no choquen con los viejos.
  let maxId = 0;
  for (const g of [...PZ_GROUPS, 'texts']) for (const c of p[g]) { const n = parseInt(String(c.id || '').replace(/^\D+/, ''), 10); if (pzNum(n) && n > maxId) maxId = n; }
  if (!pzNum(p.nextId) || p.nextId <= maxId) p.nextId = maxId + 1;

  const known = new Map((Array.isArray(s.assets) ? s.assets : []).filter((a) => a && typeof a.id === 'string').map((a) => [a.id, a]));
  const assets = p.assets.map((a) => { const k = known.get(a.id) || {}; return { id: a.id, name: String(k.name || a.name || ''), duration: a.duration, w: pzNum(k.w) ? k.w : 0, h: pzNum(k.h) ? k.h : 0, size: pzNum(k.size) ? k.size : 0, type: String(k.type || ''), kind: String(k.kind || ''), stored: k.stored === true }; });
  let seq = pzNum(s.assetSeq) ? s.assetSeq : 0;
  for (const a of p.assets) { const n = parseInt(String(a.id).replace(/^\D+/, ''), 10); if (pzNum(n) && n > seq) seq = n; }
  return { ok: true, warnings, snapshot: { schema: PERSIST_SCHEMA, version: PERSIST_VERSION, savedAt: pzNum(s.savedAt) ? s.savedAt : 0, assetSeq: seq, tlTime: pzNum(s.tlTime) && s.tlTime >= 0 ? s.tlTime : 0, project: p, assets } };
}

/** Archivos del proyecto que no están en el teléfono (hay que volver a elegirlos). */
export function missingAssets(snapshot, available) {
  const have = new Set(available);
  const used = new Set(PZ_GROUPS.flatMap((g) => snapshot.project[g].map((c) => c.asset_id)));
  return snapshot.assets.filter((a) => used.has(a.id) && !have.has(a.id));
}

/** Empareja archivos elegidos con los que faltan: primero por nombre y tamaño, luego solo por nombre. → { matches:[{asset, file}], left:[asset] } */
export function matchFiles(missing, files) {
  const left = [...missing], pool = [...files], matches = [];
  for (const strict of [true, false]) {
    for (const a of [...left]) {
      const i = pool.findIndex((f) => f.name === a.name && (!strict || !a.size || f.size === a.size));
      if (i < 0) continue;
      matches.push({ asset: a, file: pool[i] }); pool.splice(i, 1); left.splice(left.indexOf(a), 1);
    }
  }
  return { matches, left };
}

/** Resumen corto para la lista «Mis proyectos». */
export function makeMeta({ id, name, project, now = Date.now() }) {
  const end = [project.clips, project.overlayClips || [], project.audioClips || []].reduce((m, g) => g.reduce((n, c) => Math.max(n, c.start + (c.out - c.in)), m), 0);
  return { id, name: String(name || '').slice(0, 60) || 'Proyecto', updatedAt: now, clips: project.clips.length + (project.overlayClips || []).length, duration: Math.round(end * 10) / 10 };
}
export const newProjectId = (now = Date.now(), rnd = Math.random()) => 'p' + now.toString(36) + Math.floor(rnd * 1296).toString(36);
export function defaultName(now = Date.now()) {
  const d = new Date(now), m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()], z = (n) => String(n).padStart(2, '0');
  return `Proyecto ${d.getDate()} ${m} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

// ---------- IndexedDB (solo en el navegador). Varios proyectos: cada uno con su id. ----------
// Almacenes v2: pj = proyectos (id -> JSON), pb = archivos (id/asset -> Blob), pi = resumen (id -> meta).
// Los almacenes de la v1 (project/blobs, un solo proyecto «current») se pasan a v2 la primera vez (pzMigrateLegacy).
const PZ_DB = 'wivra';
const pzReq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const pzDone = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('cancelado')); });
const pzRange = (pid) => IDBKeyRange.bound(pid + '/', pid + '/\uffff');

export function pzOpen(idb = globalThis.indexedDB) {
  return new Promise((res, rej) => {
    if (!idb) return rej(new Error('Este navegador no tiene almacenamiento local.'));
    const r = idb.open(PZ_DB, 2);
    r.onupgradeneeded = () => { const d = r.result; for (const n of ['project', 'blobs', 'pj', 'pb', 'pi']) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('El almacenamiento está bloqueado por otra pestaña.'));
  });
}
/** Si hay un proyecto de la v1, lo pasa a v2 con nombre «Proyecto anterior». → id o null. */
export async function pzMigrateLegacy(db) {
  const raw = await pzReq(db.transaction('project').objectStore('project').get('current'));
  if (raw === undefined) return null;
  const id = 'legacy1', bl = db.transaction('blobs').objectStore('blobs'), keys = await pzReq(bl.getAllKeys());
  const blobs = []; for (const k of keys) blobs.push([k, await pzReq(db.transaction('blobs').objectStore('blobs').get(k))]);
  const r = readSnapshot(raw), tx = db.transaction(['pj', 'pb', 'pi', 'project', 'blobs'], 'readwrite');
  tx.objectStore('pj').put(typeof raw === 'string' ? raw : JSON.stringify(raw), id);
  for (const [k, b] of blobs) tx.objectStore('pb').put(b, id + '/' + k);
  tx.objectStore('pi').put(r.ok ? makeMeta({ id, name: 'Proyecto anterior', project: r.snapshot.project, now: r.snapshot.savedAt || Date.now() }) : { id, name: 'Proyecto anterior (dañado)', updatedAt: Date.now(), clips: 0, duration: 0 }, id);
  tx.objectStore('project').delete('current'); tx.objectStore('blobs').clear();
  await pzDone(tx); return id;
}
/** Lista de proyectos, el más reciente primero. */
export async function pzList(db) {
  const all = await pzReq(db.transaction('pi').objectStore('pi').getAll());
  return all.filter((m) => m && m.id).sort((a, b) => b.updatedAt - a.updatedAt);
}
/** Guarda un archivo del proyecto. → true si quedó guardado (false normalmente = sin espacio). */
export async function pzPutBlob(db, pid, id, file) {
  try { const tx = db.transaction('pb', 'readwrite'); tx.objectStore('pb').put(file, pid + '/' + id); await pzDone(tx); return true; }
  catch { return false; }
}
/** Guarda el proyecto y su resumen a la vez (o ambos o ninguno). */
export async function pzSaveSnapshot(db, pid, snapshot, meta) {
  const tx = db.transaction(['pj', 'pi'], 'readwrite'); tx.objectStore('pj').put(JSON.stringify(snapshot), pid); tx.objectStore('pi').put(meta, pid); await pzDone(tx);
}
export async function pzDeleteBlobs(db, pid, keepIds) {
  const keep = new Set(keepIds.map((k) => pid + '/' + k)), tx = db.transaction('pb', 'readwrite'), st = tx.objectStore('pb');
  const keys = await pzReq(st.getAllKeys(pzRange(pid))); for (const k of keys) if (!keep.has(k)) st.delete(k); await pzDone(tx);
}
/** → { raw, meta, blobs:{assetId:Blob} } o null si no existe. */
export async function pzLoad(db, pid) {
  const raw = await pzReq(db.transaction('pj').objectStore('pj').get(pid)); if (raw === undefined) return null;
  const meta = await pzReq(db.transaction('pi').objectStore('pi').get(pid)) || null;
  const keys = await pzReq(db.transaction('pb').objectStore('pb').getAllKeys(pzRange(pid))), blobs = {};
  for (const k of keys) blobs[k.slice(pid.length + 1)] = await pzReq(db.transaction('pb').objectStore('pb').get(k));
  return { raw, meta, blobs };
}
export async function pzDeleteProject(db, pid) {
  const tx = db.transaction(['pj', 'pb', 'pi'], 'readwrite'); tx.objectStore('pj').delete(pid); tx.objectStore('pi').delete(pid); tx.objectStore('pb').delete(pzRange(pid)); await pzDone(tx);
}
export async function pzRename(db, pid, name) {
  const st = db.transaction('pi').objectStore('pi'), m = await pzReq(st.get(pid)); if (!m) return;
  const tx = db.transaction('pi', 'readwrite'); tx.objectStore('pi').put({ ...m, name: String(name || '').slice(0, 60) || m.name }, pid); await pzDone(tx);
}
