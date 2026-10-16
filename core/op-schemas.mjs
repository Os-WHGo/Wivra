// Tabla ÚNICA de operaciones que puede pedir la IA: de aquí salen el esquema de herramientas (core/tools.mjs),
// el esquema plano del chat directo (app/ai-client.mjs) y la lista del prompt. El validador real sigue siendo core/operations.mjs;
// un test falla si una operación del motor no tiene esquema aquí (o al revés). — Claude
import { SHAPE_IDS, FX, FORMATS, FITS, MAX_TRACKS, AUDIO_ROLES } from './operations.mjs';
import { LOOK_IDS, FILTER_RANGES } from './filters.mjs';

const osT = { type: 'number', minimum: 0, description: 'segundos' };
const osUnit = (d) => ({ type: 'number', minimum: 0, maximum: 1, description: d });
const osFilterProps = Object.fromEntries(Object.entries(FILTER_RANGES).map(([k, [lo, hi]]) => [k, { type: 'number', minimum: lo, maximum: hi, description: `${k} (${lo} a ${hi}; 0 = sin cambio)` }]));
const osP = {
  clip_id: { type: 'string' }, asset_id: { type: 'string' },
  start: osT, in: osT, out: osT, at: osT, duration: { type: 'number', exclusiveMinimum: 0, description: 'segundos' },
  muted: { type: 'boolean' }, volume: { type: 'number', minimum: 0, maximum: 2, description: '0 a 2; 1 = original' },
  text: { type: 'string', maxLength: 120 },
  role: { type: 'string', enum: AUDIO_ROLES }, track: { type: 'integer', minimum: 1, maximum: MAX_TRACKS, description: `fila 1 a ${MAX_TRACKS} (mayor = más arriba)` },
  x: osUnit('centro horizontal, 0 a 1 del cuadro'), y: osUnit('centro vertical, 0 a 1 del cuadro'), scale: { type: 'number', minimum: 0.05, maximum: 1, description: 'ancho, 0.05 a 1 del cuadro' },
  shape: { type: 'string', enum: SHAPE_IDS }, zoom: { type: 'number', minimum: 1, maximum: 4 }, px: osUnit('posición del video dentro de la forma'), py: osUnit('posición del video dentro de la forma'),
  frame: { type: 'number', minimum: 0, maximum: 0.1, description: 'grosor del marco' }, frameColor: { type: 'string', description: 'color #rrggbb' }, opacity: { type: 'number', minimum: 0.1, maximum: 1 },
  intro: { type: 'string', enum: FX, description: 'efecto al aparecer' }, outro: { type: 'string', enum: FX, description: 'efecto al desaparecer' }, dur: { type: 'number', minimum: 0.1, maximum: 3, description: 'segundos del efecto' },
  look: { type: 'string', enum: LOOK_IDS, description: 'ajuste preparado; none lo quita' }, reset: { type: 'boolean', description: 'true quita el filtro' }, ...osFilterProps,
  aspect: { type: 'string', enum: FORMATS }, fit: { type: 'string', enum: FITS, description: 'cover recorta, contain deja barras' },
};
const osF = Object.keys(osFilterProps);
export const OP_SCHEMAS = {
  add_clip: { desc: 'agrega un video (no imágenes) a la línea principal', required: ['asset_id'], props: ['asset_id', 'start'] },
  add_photo_clip: { desc: 'agrega una foto o GIF a la línea principal (dura `duration` s, 3 por omisión; sin sonido); solo imágenes', required: ['asset_id'], props: ['asset_id', 'start', 'duration'] },
  add_audio_clip: { desc: 'pista de audio aparte (música, micrófono); no cambia la duración del video', required: ['asset_id'], props: ['asset_id', 'start', 'in', 'out', 'role', 'volume', 'muted', 'track'] },
  add_overlay_clip: { desc: 'video o imagen superpuesta (capa) con posición y tamaño', required: ['asset_id'], props: ['asset_id', 'start', 'in', 'out', 'track', 'x', 'y', 'scale', 'volume', 'muted'] },
  set_overlay: { desc: 'cambia posición, tamaño, forma, marco u opacidad de una capa', required: ['clip_id'], props: ['clip_id', 'x', 'y', 'scale', 'track', 'shape', 'zoom', 'px', 'py', 'frame', 'frameColor', 'opacity'] },
  set_audio_clip: { desc: 'cambia la fila o el papel de una pista de audio', required: ['clip_id'], props: ['clip_id', 'track', 'role'] },
  set_clip_fx: { desc: 'efecto de entrada/salida (fade, slide, zoom) de un clip de video o capa', required: ['clip_id'], props: ['clip_id', 'intro', 'outro', 'dur'] },
  set_clip_filter: { desc: 'filtro de color de un clip de video o capa (look preparado y/o ajustes sueltos)', required: ['clip_id'], props: ['clip_id', 'look', 'reset', ...osF] },
  set_format: { desc: 'forma del cuadro de salida (original, 9:16, 1:1, 4:5, 16:9) y cómo se ajusta', required: [], props: ['aspect', 'fit'] },
  trim_clip: { desc: 'recorta un clip (in/out dentro de la duración del medio)', required: ['clip_id', 'in', 'out'], props: ['clip_id', 'in', 'out'] },
  split_clip: { desc: 'corta un clip en dos en el tiempo `at` del medio', required: ['clip_id', 'at'], props: ['clip_id', 'at'] },
  move_clip: { desc: 'mueve un clip a otro instante de la línea de tiempo', required: ['clip_id', 'start'], props: ['clip_id', 'start'] },
  set_clip_audio: { desc: 'silencia o cambia el volumen del audio de un clip', required: ['clip_id'], props: ['clip_id', 'muted', 'volume'] },
  delete_clip: { desc: 'borra un clip', required: ['clip_id'], props: ['clip_id'] },
  add_text: { desc: 'texto en pantalla', required: ['text', 'start', 'duration'], props: ['text', 'start', 'duration'] },
};
export const OP_SCHEMA_NAMES = Object.keys(OP_SCHEMAS);
const osPick = (names) => Object.fromEntries(names.map((k) => [k, osP[k]]));

/** Una variante por operación (formato JSON Schema con oneOf/const), para herramientas que lo aceptan. */
export const opsOneOf = () => OP_SCHEMA_NAMES.map((n) => ({ type: 'object', required: ['op', ...OP_SCHEMAS[n].required], properties: { op: { const: n }, ...osPick(OP_SCHEMAS[n].props) } }));
/** Un solo objeto "plano" (sin oneOf/const) con la unión de propiedades: lo aceptan más proveedores. El validador del editor decide. */
export const opsFlat = () => ({ type: 'object', required: ['op'], properties: { op: { type: 'string', enum: OP_SCHEMA_NAMES }, ...osPick([...new Set(OP_SCHEMA_NAMES.flatMap((n) => OP_SCHEMAS[n].props))]) } });
/** Texto para el prompt del sistema: una línea por operación, generada de la misma tabla. */
export const opsPrompt = () => OP_SCHEMA_NAMES.map((n) => `- ${n} {${OP_SCHEMAS[n].props.filter((k) => OP_SCHEMAS[n].required.includes(k)).join(',')}${OP_SCHEMAS[n].props.some((k) => !OP_SCHEMAS[n].required.includes(k)) ? (OP_SCHEMAS[n].required.length ? ',' : '') + OP_SCHEMAS[n].props.filter((k) => !OP_SCHEMAS[n].required.includes(k)).map((k) => k + '?').join(',') : ''}} · ${OP_SCHEMAS[n].desc}`).join('\n');
