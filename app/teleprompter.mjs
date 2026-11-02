// Teleprompter: cuentas puras para desplazar el guion de una toma a una velocidad de lectura. Sin DOM. — Claude
// El guion se muestra en pantalla y NO se graba ni se incrusta en el video (la pantalla del teleprompter queda fuera del cuadro grabado).
export const TP_SPEEDS = { slow: 100, normal: 140, fast: 180 };      // palabras por minuto (lectura en voz alta cómoda; guía de Wivra, cada persona ajusta)
export const TP_SIZES = [20, 26, 34, 44], TP_DEFAULT_SIZE = 1;       // px de letra
export const tpWords = (text) => (String(text || '').trim().match(/\S+/g) || []).length;
/** Segundos que tarda en leerse `text` a `wpm` palabras por minuto. */
export const tpSeconds = (text, wpm = TP_SPEEDS.normal) => (wpm > 0 ? Math.round((tpWords(text) / wpm) * 60 * 10) / 10 : 0);
/** Píxeles por segundo para recorrer un guion de `words` palabras que mide `scrollHeight` px de alto, leído a `wpm`. 0 si no hay datos. */
export function tpPxPerSecond(wpm, scrollHeight, words) {
  if (!(wpm > 0) || !(scrollHeight > 0) || !(words > 0)) return 0;
  return (scrollHeight / words) * (wpm / 60);
}
/** Texto del guion listo para mostrar: recorta espacios y deja líneas en blanco entre párrafos (un máximo de 2 saltos seguidos). */
export const tpClean = (text) => String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
