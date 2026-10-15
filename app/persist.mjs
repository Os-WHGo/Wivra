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

// ---------- IndexedDB (solo en el navegador) ----------
const PZ_DB = 'wivra', PZ_SP = 'project', PZ_SB = 'blobs', PZ_KEY = 'current';
const pzReq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const pzDone = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('cancelado')); });

export function pzOpen(idb = globalThis.indexedDB) {
  return new Promise((res, rej) => {
    if (!idb) return rej(new Error('Este navegador no tiene almacenamiento local.'));
    const r = idb.open(PZ_DB, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(PZ_SP)) d.createObjectStore(PZ_SP); if (!d.objectStoreNames.contains(PZ_SB)) d.createObjectStore(PZ_SB); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('El almacenamiento está bloqueado por otra pestaña.'));
  });
}

/** Guarda un archivo (si ya estaba, no lo repite). → true si quedó guardado. */
export async function pzPutBlob(db, id, file) {
  try { const tx = db.transaction(PZ_SB, 'readwrite'); tx.objectStore(PZ_SB).put(file, id); await pzDone(tx); return true; }
  catch { return false; }          // normalmente QuotaExceededError
}
export async function pzSaveSnapshot(db, snapshot) {
  const tx = db.transaction(PZ_SP, 'readwrite'); tx.objectStore(PZ_SP).put(JSON.stringify(snapshot), PZ_KEY); await pzDone(tx);
}
export async function pzDeleteBlobs(db, keepIds) {
  const keep = new Set(keepIds), tx = db.transaction(PZ_SB, 'readwrite'), st = tx.objectStore(PZ_SB);
  const keys = await pzReq(st.getAllKeys()); for (const k of keys) if (!keep.has(k)) st.delete(k); await pzDone(tx);
}
/** → { raw, blobs:{id:Blob} } o null si no hay nada guardado. */
export async function pzLoad(db) {
  const raw = await pzReq(db.transaction(PZ_SP).objectStore(PZ_SP).get(PZ_KEY)); if (raw === undefined) return null;
  const st = db.transaction(PZ_SB).objectStore(PZ_SB), keys = await pzReq(st.getAllKeys()), blobs = {};
  for (const k of keys) blobs[k] = await pzReq(db.transaction(PZ_SB).objectStore(PZ_SB).get(k));
  return { raw, blobs };
}
export async function pzClear(db) {
  const tx = db.transaction([PZ_SP, PZ_SB], 'readwrite'); tx.objectStore(PZ_SP).clear(); tx.objectStore(PZ_SB).clear(); await pzDone(tx);
}
