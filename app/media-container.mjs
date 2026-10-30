// Wivra · contenedores de exportación sin dependencias. MediaRecorder escribe WebM y MP4
// «en vivo»: el WebM no lleva duración ni índice (Cues) y el MP4 fragmentado declara
// duración 0 y no tiene índice (mfra). Muchas galerías no muestran la duración ni dejan
// avanzar o retroceder. Aquí se reparan SIN recodificar: se copian los mismos bytes de
// audio y video y solo se reescriben las cabeceras. Si algo no se entiende, se devuelve
// el original intacto con el motivo: nunca se entrega un archivo peor que el grabado. — Claude

// ---------- EBML (WebM / Matroska) ----------
const MC_EB = {
  EBML: 0x1A45DFA3, Segment: 0x18538067, SeekHead: 0x114D9B74, Seek: 0x4DBB, SeekID: 0x53AB, SeekPosition: 0x53AC,
  Info: 0x1549A966, TimecodeScale: 0x2AD7B1, Duration: 0x4489, Tracks: 0x1654AE6B, TrackEntry: 0xAE,
  TrackNumber: 0xD7, TrackType: 0x83, CodecID: 0x86, Cluster: 0x1F43B675, Timecode: 0xE7, SimpleBlock: 0xA3,
  BlockGroup: 0xA0, Block: 0xA1, ReferenceBlock: 0xFB, Cues: 0x1C53BB6B, CuePoint: 0xBB, CueTime: 0xB3,
  CueTrackPositions: 0xB7, CueTrack: 0xF7, CueClusterPosition: 0xF1, Void: 0xEC,
};
const MC_TOP_LEVEL = new Set([MC_EB.SeekHead, MC_EB.Info, MC_EB.Tracks, MC_EB.Cluster, MC_EB.Cues, 0x1254C367, 0x1043A770, 0x1941A469, MC_EB.Void]);
const MC_UNKNOWN = -1;

function mcReadId(b, p) {
  const first = b[p];
  const len = first >= 0x80 ? 1 : first >= 0x40 ? 2 : first >= 0x20 ? 3 : first >= 0x10 ? 4 : 0;
  if (!len || p + len > b.length) throw new Error('EBML: identificador inválido en ' + p);
  let id = 0; for (let i = 0; i < len; i++) id = id * 256 + b[p + i];
  return { id, len };
}
function mcReadSize(b, p) {
  const first = b[p]; let len = 1, mask = 0x80;
  while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
  if (len > 8 || p + len > b.length) throw new Error('EBML: tamaño inválido en ' + p);
  let v = first & (mask - 1), allOnes = v === mask - 1;
  for (let i = 1; i < len; i++) { v = v * 256 + b[p + i]; if (b[p + i] !== 0xFF) allOnes = false; }
  return { size: allOnes ? MC_UNKNOWN : v, len };
}
const mcIdBytes = (id) => { const out = []; while (id > 0) { out.unshift(id & 0xFF); id = Math.floor(id / 256); } return out; };
/** Tamaño EBML de 8 bytes: estable aunque cambie el valor (evita recalcular desplazamientos). */
const mcSize8 = (n) => { const out = [0x01]; for (let i = 6; i >= 0; i--) out.push(Math.floor(n / 2 ** (8 * i)) & 0xFF); return out; };
const mcUintBytes = (n, width) => { const out = []; for (let i = width - 1; i >= 0; i--) out.push(Math.floor(n / 2 ** (8 * i)) & 0xFF); return out; };
const mcElement = (id, payload) => [...mcIdBytes(id), ...mcSize8(payload.length), ...payload];
const mcUintElement = (id, n, width = 8) => mcElement(id, mcUintBytes(n, width));

/** Lee el WebM de MediaRecorder: cabecera, Info, Tracks y los clusters (aunque tengan tamaño desconocido). */
export function parseWebm(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = mcReadId(b, 0); if (head.id !== MC_EB.EBML) throw new Error('No empieza como WebM (falta EBML).');
  const headSize = mcReadSize(b, head.len), ebmlEnd = head.len + headSize.len + headSize.size;
  const seg = mcReadId(b, ebmlEnd); if (seg.id !== MC_EB.Segment) throw new Error('WebM sin Segment.');
  const segSize = mcReadSize(b, ebmlEnd + seg.len), dataStart = ebmlEnd + seg.len + segSize.len;
  const segEnd = segSize.size === MC_UNKNOWN ? b.length : Math.min(b.length, dataStart + segSize.size);
  const out = { ebml: b.subarray(0, ebmlEnd), info: null, tracks: null, extras: [], clusters: [], timecodeScale: 1e6, trackTypes: new Map(), codecs: new Map() };
  let p = dataStart;
  while (p < segEnd) {
    const { id, len } = mcReadId(b, p); const sz = mcReadSize(b, p + len), bodyStart = p + len + sz.len;
    if (id === MC_EB.Cluster) {
      // Un cluster «en vivo» no dice su tamaño: termina donde empieza el siguiente elemento de nivel superior.
      let q = bodyStart, end = sz.size === MC_UNKNOWN ? segEnd : Math.min(segEnd, bodyStart + sz.size);
      const children = []; let truncated = false;
      while (q < end) {
        const c = mcReadId(b, q);
        if (sz.size === MC_UNKNOWN && MC_TOP_LEVEL.has(c.id)) { end = q; break; }
        const cs = mcReadSize(b, q + c.len); if (cs.size === MC_UNKNOWN) throw new Error('WebM: bloque de tamaño desconocido.');
        const cEnd = q + c.len + cs.len + cs.size;
        if (cEnd > b.length) { end = q; truncated = true; break; }   // último bloque cortado: se descarta, no se inventa
        children.push({ id: c.id, start: q, bodyStart: q + c.len + cs.len, end: cEnd });
        q = cEnd;
      }
      out.clusters.push({ start: p, end, children });
      if (truncated) { out.truncated = true; break; }   // nada válido puede seguir a un bloque cortado
      p = end; continue;
    }
    if (sz.size === MC_UNKNOWN) throw new Error('WebM: elemento de nivel superior sin tamaño.');
    const end = bodyStart + sz.size; if (end > b.length) throw new Error('WebM truncado.');
    if (id === MC_EB.Info) out.info = { start: p, bodyStart, end };
    else if (id === MC_EB.Tracks) out.tracks = { start: p, bodyStart, end };
    else if (id !== MC_EB.SeekHead && id !== MC_EB.Cues && id !== MC_EB.Void) out.extras.push({ start: p, end });
    p = end;
  }
  if (!out.info || !out.tracks) throw new Error('WebM sin Info o Tracks.');
  // TimecodeScale y tipo de cada pista.
  for (let q = out.info.bodyStart; q < out.info.end;) {
    const c = mcReadId(b, q), cs = mcReadSize(b, q + c.len), body = q + c.len + cs.len;
    if (c.id === MC_EB.TimecodeScale) { let v = 0; for (let i = 0; i < cs.size; i++) v = v * 256 + b[body + i]; out.timecodeScale = v; }
    q = body + cs.size;
  }
  for (let q = out.tracks.bodyStart; q < out.tracks.end;) {
    const c = mcReadId(b, q), cs = mcReadSize(b, q + c.len), body = q + c.len + cs.len;
    if (c.id === MC_EB.TrackEntry) {
      let num = 0, type = 0, codec = '';
      for (let r = body; r < body + cs.size;) {
        const e = mcReadId(b, r), es = mcReadSize(b, r + e.len), eb = r + e.len + es.len;
        let v = 0; if (e.id === MC_EB.TrackNumber || e.id === MC_EB.TrackType) for (let i = 0; i < es.size; i++) v = v * 256 + b[eb + i];
        if (e.id === MC_EB.TrackNumber) num = v; else if (e.id === MC_EB.TrackType) type = v;
        else if (e.id === MC_EB.CodecID) codec = String.fromCharCode(...b.subarray(eb, eb + es.size));
        r = eb + es.size;
      }
      out.trackTypes.set(num, type === 1 ? 'video' : type === 2 ? 'audio' : 'other'); out.codecs.set(num, codec);
    }
    q = body + cs.size;
  }
  // Tiempo de cada cluster y de cada bloque (para la duración real y el índice).
  const lastTimes = new Map(), deltas = new Map();
  for (const cl of out.clusters) {
    cl.time = null; cl.keyframeVideo = false; let firstVideoSeen = false;
    for (const ch of cl.children) {
      if (ch.id === MC_EB.Timecode) { let v = 0; for (let i = ch.bodyStart; i < ch.end; i++) v = v * 256 + b[i]; cl.time = v; }
      else if ((ch.id === MC_EB.SimpleBlock || ch.id === MC_EB.BlockGroup) && cl.time != null) {
        let blk = ch.bodyStart, blkEnd = ch.end, key = false;
        if (ch.id === MC_EB.BlockGroup) {
          blk = -1; key = true;
          for (let r = ch.bodyStart; r < ch.end;) { const e = mcReadId(b, r), es = mcReadSize(b, r + e.len), eb = r + e.len + es.len; if (e.id === MC_EB.Block) { blk = eb; blkEnd = eb + es.size; } if (e.id === MC_EB.ReferenceBlock) key = false; r = eb + es.size; }
          if (blk < 0) continue;
        }
        const tn = mcReadSize(b, blk), track = tn.size, rel = (b[blk + tn.len] << 24 >> 16) | b[blk + tn.len + 1];
        if (ch.id === MC_EB.SimpleBlock) key = !!(b[blk + tn.len + 2] & 0x80);
        const t = cl.time + rel, prev = lastTimes.get(track);
        if (prev != null && t > prev) deltas.set(track, t - prev);
        lastTimes.set(track, Math.max(prev ?? -Infinity, t));
        if (out.trackTypes.get(track) === 'video' && !firstVideoSeen) { firstVideoSeen = true; cl.keyframeVideo = key; cl.videoTrack = track; }
        void blkEnd;
      }
    }
  }
  let endTicks = 0;
  for (const [track, t] of lastTimes) endTicks = Math.max(endTicks, t + (deltas.get(track) || 0));
  out.durationTicks = endTicks;
  out.durationMs = endTicks * out.timecodeScale / 1e6;
  return out;
}

/**
 * Devuelve un WebM con Duration, Cues (índice para avanzar/retroceder), SeekHead y tamaños
 * conocidos. Los bloques de audio y video se copian byte a byte.
 */
export function webmMakeSeekable(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const w = parseWebm(b);
  if (!w.clusters.length) throw new Error('WebM sin clusters: no hay audio ni video.');
  // Info sin Duration previa, más Duration (float64) calculada de los propios bloques.
  const infoBody = [];
  for (let q = w.info.bodyStart; q < w.info.end;) {
    const c = mcReadId(b, q), cs = mcReadSize(b, q + c.len), end = q + c.len + cs.len + cs.size;
    if (c.id !== MC_EB.Duration && c.id !== MC_EB.Void) infoBody.push(...b.subarray(q, end));
    q = end;
  }
  const dur = new DataView(new ArrayBuffer(8)); dur.setFloat64(0, w.durationTicks);
  infoBody.push(...mcElement(MC_EB.Duration, [...new Uint8Array(dur.buffer)]));
  const info = mcElement(MC_EB.Info, infoBody);
  const tracks = b.subarray(w.tracks.start, w.tracks.end);
  const extrasLen = w.extras.reduce((n, e) => n + (e.end - e.start), 0);
  // Clusters con tamaño conocido (cabecera de 8 bytes) y mismos hijos.
  const clusterHeads = w.clusters.map((cl) => { const bodyLen = cl.children.reduce((n, c) => n + (c.end - c.start), 0); return { cl, bodyLen, head: [...mcIdBytes(MC_EB.Cluster), ...mcSize8(bodyLen)] }; });
  const cueClusters = clusterHeads.filter((c) => c.cl.time != null && (c.cl.keyframeVideo || c.cl.videoTrack == null));
  const cueTrack = [...w.trackTypes].find(([, t]) => t === 'video')?.[0] ?? [...w.trackTypes.keys()][0] ?? 1;
  const cuePointLen = mcElement(MC_EB.CuePoint, [...mcUintElement(MC_EB.CueTime, 0), ...mcElement(MC_EB.CueTrackPositions, [...mcUintElement(MC_EB.CueTrack, 0), ...mcUintElement(MC_EB.CueClusterPosition, 0)])]).length;
  const cuesLen = mcIdBytes(MC_EB.Cues).length + 8 + cuePointLen * cueClusters.length;
  const seekEntry = (id, pos) => mcElement(MC_EB.Seek, [...mcElement(MC_EB.SeekID, mcIdBytes(id)), ...mcUintElement(MC_EB.SeekPosition, pos)]);
  const seekHeadLen = mcElement(MC_EB.SeekHead, [...seekEntry(MC_EB.Info, 0), ...seekEntry(MC_EB.Tracks, 0), ...seekEntry(MC_EB.Cues, 0)]).length;
  // Desplazamientos relativos al inicio de los datos del Segment.
  const infoPos = seekHeadLen, tracksPos = infoPos + info.length, cuesPos = tracksPos + tracks.length + extrasLen;
  let pos = cuesPos + cuesLen; const clusterPos = new Map();
  for (const c of clusterHeads) { clusterPos.set(c.cl, pos); pos += c.head.length + c.bodyLen; }
  const segBodyLen = pos;
  const cues = mcElement(MC_EB.Cues, cueClusters.flatMap((c) => mcElement(MC_EB.CuePoint, [...mcUintElement(MC_EB.CueTime, c.cl.time), ...mcElement(MC_EB.CueTrackPositions, [...mcUintElement(MC_EB.CueTrack, c.cl.videoTrack ?? cueTrack), ...mcUintElement(MC_EB.CueClusterPosition, clusterPos.get(c.cl))])])));
  const seekHead = mcElement(MC_EB.SeekHead, [...seekEntry(MC_EB.Info, infoPos), ...seekEntry(MC_EB.Tracks, tracksPos), ...seekEntry(MC_EB.Cues, cuesPos)]);
  if (seekHead.length !== seekHeadLen || cues.length !== cuesLen) throw new Error('Índice WebM inconsistente.');
  const segHead = [...mcIdBytes(MC_EB.Segment), ...mcSize8(segBodyLen)];
  const out = new Uint8Array(w.ebml.length + segHead.length + segBodyLen);
  let o = 0; const put = (arr) => { out.set(arr, o); o += arr.length; };
  put(w.ebml); put(segHead); put(seekHead); put(info); put(tracks);
  for (const e of w.extras) put(b.subarray(e.start, e.end));
  put(cues);
  for (const c of clusterHeads) { put(c.head); for (const ch of c.cl.children) put(b.subarray(ch.start, ch.end)); }
  if (o !== out.length) throw new Error('Tamaño WebM inconsistente.');
  return { bytes: out, durationMs: w.durationMs, cues: cueClusters.length, clusters: w.clusters.length };
}

// ---------- ISO BMFF (MP4 fragmentado) ----------
const mcU32 = (b, p) => ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
const mcU64 = (b, p) => mcU32(b, p) * 2 ** 32 + mcU32(b, p + 4);
const mcType4 = (b, p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
function* mcMp4Boxes(b, start, end) {
  let p = start;
  while (p + 8 <= end) {
    let size = mcU32(b, p), hdr = 8; const type = mcType4(b, p + 4);
    if (size === 1) { size = mcU64(b, p + 8); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) throw new Error('MP4: caja ' + type + ' inválida o truncada.');
    yield { type, start: p, body: p + hdr, end: p + size };
    p += size;
  }
}
const mcChild = (b, mcBox, type) => { for (const c of mcMp4Boxes(b, mcBox.body, mcBox.end)) if (c.type === type) return c; return null; };

/** Lee un MP4 (normal o fragmentado): pistas, escala de tiempo y duración real de las muestras. */
export function parseMp4(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const top = [...mcMp4Boxes(b, 0, b.length)];
  if (!top.length || top[0].type !== 'ftyp') throw new Error('No empieza como MP4 (falta ftyp).');
  const moov = top.find((x) => x.type === 'moov'); if (!moov) throw new Error('MP4 sin moov.');
  const mvhd = mcChild(b, moov, 'mvhd'), mvex = mcChild(b, moov, 'mvex');
  const movieScale = mcU32(b, mvhd.body + (b[mvhd.body] === 1 ? 20 : 12));
  const tracks = new Map();
  for (const trak of mcMp4Boxes(b, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue;
    const tkhd = mcChild(b, trak, 'tkhd'), mdia = mcChild(b, trak, 'mdia'), mdhd = mcChild(b, mdia, 'mdhd'), hdlr = mcChild(b, mdia, 'hdlr');
    const id = mcU32(b, tkhd.body + (b[tkhd.body] === 1 ? 20 : 12));
    const scale = mcU32(b, mdhd.body + (b[mdhd.body] === 1 ? 20 : 12));
    const handler = mcType4(b, hdlr.body + 8);
    let defaultDuration = 0, defaultFlags = 0;
    if (mvex) for (const t of mcMp4Boxes(b, mvex.body, mvex.end)) if (t.type === 'trex' && mcU32(b, t.body + 4) === id) { defaultDuration = mcU32(b, t.body + 12); defaultFlags = mcU32(b, t.body + 20); }
    tracks.set(id, { id, scale, kind: handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : handler, tkhd, mdhd, end: 0, defaultDuration, defaultFlags, fragments: [] });
  }
  const moofs = top.filter((x) => x.type === 'moof');
  let absoluteOffsets = false;
  moofs.forEach((moof, index) => {
    for (const traf of mcMp4Boxes(b, moof.body, moof.end)) {
      if (traf.type !== 'traf') continue;
      const tfhd = mcChild(b, traf, 'tfhd'), flags = mcU32(b, tfhd.body) & 0xFFFFFF, id = mcU32(b, tfhd.body + 4);
      const tr = tracks.get(id); if (!tr) continue;
      let q = tfhd.body + 8; if (flags & 0x01) { absoluteOffsets = true; q += 8; } if (flags & 0x02) q += 4;
      let defDur = tr.defaultDuration, defFlags = tr.defaultFlags;
      if (flags & 0x08) { defDur = mcU32(b, q); q += 4; } if (flags & 0x10) q += 4; if (flags & 0x20) defFlags = mcU32(b, q);
      const tfdt = mcChild(b, traf, 'tfdt'); let t = tfdt ? (b[tfdt.body] === 1 ? mcU64(b, tfdt.body + 4) : mcU32(b, tfdt.body + 4)) : tr.end;
      const start = t; let firstSync = null;
      for (const trun of mcMp4Boxes(b, traf.body, traf.end)) {
        if (trun.type !== 'trun') continue;
        const tf = mcU32(b, trun.body) & 0xFFFFFF, count = mcU32(b, trun.body + 4); let r = trun.body + 8;
        if (tf & 0x01) r += 4; let firstFlags = null; if (tf & 0x04) { firstFlags = mcU32(b, r); r += 4; }
        for (let i = 0; i < count; i++) {
          let d = defDur, sf = i === 0 && firstFlags != null ? firstFlags : defFlags;
          if (tf & 0x100) { d = mcU32(b, r); r += 4; } if (tf & 0x200) r += 4; if (tf & 0x400) { const v = mcU32(b, r); r += 4; if (!(i === 0 && firstFlags != null)) sf = v; } if (tf & 0x800) r += 4;
          if (firstSync == null) firstSync = !(sf & 0x00010000);
          t += d;
        }
      }
      tr.fragments.push({ moof, index, time: start, sync: firstSync !== false });
      tr.end = Math.max(tr.end, t);
    }
  });
  let durationMs = 0;
  if (moofs.length) for (const tr of tracks.values()) durationMs = Math.max(durationMs, tr.end / tr.scale * 1000);
  else { const v = b[mvhd.body]; durationMs = (v === 1 ? mcU64(b, mvhd.body + 24) : mcU32(b, mvhd.body + 16)) / movieScale * 1000; }
  return { top, moov, mvhd, mvex, movieScale, tracks, moofs, fragmented: moofs.length > 0, absoluteOffsets, durationMs,
    hasIndex: top.some((x) => x.type === 'mfra' || x.type === 'sidx') };
}

const mcBox = (type, payload) => { const out = new Uint8Array(8 + payload.length); new DataView(out.buffer).setUint32(0, out.length); out.set([...type].map((c) => c.charCodeAt(0)), 4); out.set(payload, 8); return out; };
const mcBe32 = (n) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];

/**
 * MP4 fragmentado de MediaRecorder → misma media con duración real en mvhd/tkhd/mdhd,
 * caja mehd y un índice mfra al final (avanzar/retroceder). Ningún byte de muestra se mueve
 * respecto a su moof; si el archivo usa desplazamientos absolutos, no se toca.
 */
export function fmp4AddDurationAndIndex(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const m = parseMp4(src);
  if (!m.fragmented) return { bytes: src, durationMs: m.durationMs, changed: false, reason: 'MP4 ya no fragmentado' };
  if (m.absoluteOffsets) return { bytes: src, durationMs: m.durationMs, changed: false, reason: 'desplazamientos absolutos: no se reescribe' };
  const b = src.slice();
  const movieDur = Math.round(m.durationMs * m.movieScale / 1000);
  if (movieDur >= 2 ** 32) return { bytes: src, durationMs: m.durationMs, changed: false, reason: 'duración demasiado larga para mvhd v0' };
  const setDur = (boxRef, offV0, offV1, value) => { const v = b[boxRef.body]; const dv = new DataView(b.buffer); if (v === 1) dv.setBigUint64(boxRef.body + offV1, BigInt(value)); else dv.setUint32(boxRef.body + offV0, value); };
  setDur(m.mvhd, 16, 24, movieDur);
  for (const tr of m.tracks.values()) { setDur(tr.tkhd, 20, 28, movieDur); setDur(tr.mdhd, 16, 24, Math.min(2 ** 32 - 1, tr.end)); }
  // mehd dentro de mvex: el moov crece 16 bytes; los moof usan desplazamientos relativos a sí mismos.
  let out = b, shift = 0;
  if (m.mvex && !mcChild(b, m.mvex, 'mehd')) {
    const mehd = mcBox('mehd', [0, 0, 0, 0, ...mcBe32(movieDur)]);
    out = new Uint8Array(b.length + mehd.length);
    out.set(b.subarray(0, m.mvex.body), 0); out.set(mehd, m.mvex.body); out.set(b.subarray(m.mvex.body), m.mvex.body + mehd.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(m.moov.start, mcU32(out, m.moov.start) + mehd.length);
    dv.setUint32(m.mvex.start + (m.mvex.start > m.moov.start ? 0 : 0), mcU32(out, m.mvex.start) + mehd.length);
    shift = mehd.length;
  }
  // mfra: una entrada por fragmento que empieza en cuadro clave, por pista.
  const tfras = [];
  for (const tr of m.tracks.values()) {
    const entries = tr.fragments.filter((f) => f.sync);
    const body = [1, 0, 0, 0, ...mcBe32(tr.id), 0, 0, 0, 0, ...mcBe32(entries.length)];
    for (const f of entries) {
      const off = f.moof.start + (f.moof.start > m.mvex?.body ? shift : 0);
      body.push(...mcBe32(Math.floor(f.time / 2 ** 32)), ...mcBe32(f.time >>> 0), ...mcBe32(Math.floor(off / 2 ** 32)), ...mcBe32(off >>> 0), 1, 1, 1);
    }
    tfras.push(mcBox('tfra', body));
  }
  if (m.hasIndex) return { bytes: out, durationMs: m.durationMs, changed: true, indexAdded: false };
  const mfroLen = 16, tfraLen = tfras.reduce((n, t) => n + t.length, 0);
  const mfra = mcBox('mfra', [...tfras.flatMap((t) => [...t]), ...mcBox('mfro', [0, 0, 0, 0, ...mcBe32(8 + tfraLen + mfroLen)])]);
  const final = new Uint8Array(out.length + mfra.length); final.set(out, 0); final.set(mfra, out.length);
  return { bytes: final, durationMs: m.durationMs, changed: true, indexAdded: true };
}

/** Qué contiene un archivo exportado, para verificarlo antes de entregarlo. */
export function inspectExport(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 4 && mcU32(b, 0) === 0x1A45DFA3) {
    const w = parseWebm(b);
    const kinds = [...w.trackTypes.values()];
    return { container: 'webm', durationMs: w.durationMs, video: kinds.includes('video'), audio: kinds.includes('audio'), codecs: [...w.codecs.values()],
      declaresDuration: mcHasEbmlChild(b, w.info, MC_EB.Duration), seekIndex: w.clusters.length > 0 && mcHasTopLevel(b, MC_EB.Cues) };
  }
  if (b.length >= 8 && mcType4(b, 4) === 'ftyp') {
    const m = parseMp4(b), kinds = [...m.tracks.values()].map((t) => t.kind);
    const declared = (b[m.mvhd.body] === 1 ? mcU64(b, m.mvhd.body + 24) : mcU32(b, m.mvhd.body + 16)) > 0;
    return { container: 'mp4', durationMs: m.durationMs, video: kinds.includes('video'), audio: kinds.includes('audio'), fragmented: m.fragmented,
      declaresDuration: declared, seekIndex: !m.fragmented || m.hasIndex };
  }
  throw new Error('Formato de exportación desconocido.');
}
function mcHasEbmlChild(b, parent, id) { for (let q = parent.bodyStart; q < parent.end;) { const c = mcReadId(b, q), cs = mcReadSize(b, q + c.len); if (c.id === id) return true; q += c.len + cs.len + cs.size; } return false; }
function mcHasTopLevel(b, id) { try { const w = mcReadId(b, 0), ws = mcReadSize(b, w.len); let p = w.len + ws.len + ws.size; const s = mcReadId(b, p), ss = mcReadSize(b, p + s.len); p += s.len + ss.len; const end = ss.size === MC_UNKNOWN ? b.length : p + ss.size; while (p < end) { const c = mcReadId(b, p), cs = mcReadSize(b, p + c.len); if (c.id === id) return true; if (cs.size === MC_UNKNOWN) return false; p += c.len + cs.len + cs.size; } } catch { /* sin índice */ } return false; }

/**
 * Repara la cabecera del video exportado en memoria (modo anterior / navegador). Nunca empeora:
 * si no se puede, devuelve el original y el motivo.
 */
export function finalizeExportBytes(bytes, { maxBytes = 512 * 1024 * 1024 } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length > maxBytes) return { bytes: b, fixed: false, reason: 'archivo demasiado grande para repararlo en memoria' };
  try {
    if (mcU32(b, 0) === 0x1A45DFA3) { const r = webmMakeSeekable(b); return { bytes: r.bytes, fixed: true, durationMs: r.durationMs, container: 'webm' }; }
    if (mcType4(b, 4) === 'ftyp') { const r = fmp4AddDurationAndIndex(b); return { bytes: r.bytes, fixed: r.changed, durationMs: r.durationMs, container: 'mp4', reason: r.reason }; }
    return { bytes: b, fixed: false, reason: 'formato desconocido' };
  } catch (e) { return { bytes: b, fixed: false, reason: e.message }; }
}
