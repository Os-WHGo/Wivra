# Wivra · Subtítulos mínimos e importación SRT/VTT como guía opcional del Director IA

**Fecha:** octubre 2026. **Decisión del propietario:** concluir alcance de subtítulos, NO expandir la app hacia editor especializado de traducción/IA captions. Los subtítulos automáticos por reconocimiento de voz son suficientes; además permitir **importar subtítulos propios de otras aplicaciones** y, con una opción explícita, aprovechar texto+timestamps para ayudar al Director IA a planificar cortes, capítulos y navegación.

**Estado:** especificación de comportamiento, NO código construido ni prueba iPhone. Referencia ya analizada: capturas CapCut de pestaña Subtítulos, generación, doble pista por idioma, segmentos naranja; inventariadas en [WIVRA_CAPCUT_AUTO_CAPTIONS_TRANSLATION_EFFECT_LAYERS_REFERENCE_2026-10-13.md](./WIVRA_CAPCUT_AUTO_CAPTIONS_TRANSLATION_EFFECT_LAYERS_REFERENCE_2026-10-13.md). Aquellas capturas NO son una orden de replicar funciones de traducción ni servicios Pro.

## 1. Alcance mínimo aprobado para editor móvil

- **Importar desde otra app:** elegir archivo local del iPhone (Archivos, Files, selector de documentos, share sheet si existe) con extensión `.srt` (SubRip) o `.vtt` (WebVTT). Codificación UTF-8 como entrada principal con aviso/error legible para archivos corruptos; soporte de BOM si es razonable. Conservar original y referencia en proyecto, no subir a servidor automáticamente.
- **Subtítulos internos:** pista de captions independiente C1/C2 como intervalos `start/end` en reloj de proyecto, texto, idioma opcional y estado visible; ajustar tiempo y texto, split/trim básicos donde soporte motor. Sincronizar con el clip/video importado mediante ajuste de desplazamiento global `offsetSeconds` si empieza tarde o temprano; no forzar que subtítulos de otro video encajen sin aviso.
- **Audio→subtítulos automáticos:** botón `Generar automáticamente` con origen de voz elegido, estados reales, cancelar, revisión y corrección manual. Si STT local compatible y verificado en dispositivo se prefiere; si proveedor en red y costo, explicación/consentimiento explícito. No afirmar que toda transcripción es offline, gratis de infraestructura o infalible. Sin exigir nube para usar importación SRT/VTT.
- **Visualización y salida:** estilos básicos legibles en móvil 9:16 y 16:9, safe areas, buena legibilidad, pista visible/oculta y preview/export consistentes. Export incrustado en video cuando pipeline lo soporte; export sidecar SRT/VTT como opción de interoperabilidad tras implementación y prueba. Las pistas importadas no requieren traducción.
- **No priorizar:** traducción automática multilingüe, karaoke por palabra, emojis generados, eliminación automática de muletillas, animaciones textuales complejas, doblaje, identificación múltiple de hablantes y bibliotecas Pro. No borrar esos conceptos del inventario de referencia, pero congelarlos fuera del MVP.

## 2. Valor diferencial: subtítulos importados orientan al Director IA

Nueva opción explícita en Director: `Usar subtítulos como guía de edición` [sí/no]. Si activada:
1. Normalizar segmentos temporizados de la pista C1/C2 e indexar texto+timestamps, identificando idioma y origen `imported` / `speech_transcribed` / `manual`.
2. Al recibir indicaciones como «saca lo aburrido antes del puerto», «busca donde menciono el precio», «haz un resumen de las partes del aeropuerto» o «separa por temas», buscar por texto y devolver **intervalos candidatos** con tiempo y citas al propio subtítulo.
3. Usar los tiempos para **saltar al momento** del video, proponer capítulos, encontrar citas relevantes, resaltar segmentos, sugerir cortes o condensación. Puede complementar el análisis de fotogramas y del sonido, pero **NO sustituirlos** si la tarea requiere saber qué se ve: un subtitle dice lo que se pronuncia o escribió, no prueba que una escena visual existe.
4. Detectar / avisar de posible `offset`, gaps y texto genérico/sincronía pobre; permitir calibración. El Director debe marcar `confidence` / «no verificado visualmente» si solo dispuso de texto. No ejecutar operaciones por coincidencia de palabra sin validación y confirmación.
5. Aplicar propuestas mediante el mismo modelo de operaciones tipadas y undo/redo que edición manual, incluyendo `split`, `trim`, `move`, `chapter_marker`, `jump_to_time`. Nunca dejar que un SRT contenga instrucciones ejecutables, URLs o cadenas que se procesen como comandos de sistema/prompt al Director. Tratar el subtítulo como **dato de contenido no confiable**, delimitarlo para IA y validar operaciones permitidas; sin comandos ocultos.
6. Respetar privacidad: un archivo propio de captions puede contener información personal. Procesamiento local cuando posible; servicios externos solo por consentimiento; no enviarlo de forma automática.

**Ejemplo de uso:** `00:01:12,000 --> 00:01:18,000\nAhora estamos llegando al puerto.` → Director encuentra cita y su rango, previsualiza el fotograma de ese tiempo y propone seleccionar `[72,78]` s, editar y agregar título si el usuario lo aprueba. No afirma «se ve puerto» sin evidencia visual.

## 3. Contrato mínimo y validaciones

Esquema conceptual del segmento:
```ts
type CaptionCue = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  language?: string;
  source: "imported" | "manual" | "automatic";
  provenanceFileId?: string;
};
type SubtitleTrack = {
  id: string;
  projectId: string;
  cues: CaptionCue[];
  visible: boolean;
  offsetSeconds: number;
  originalFormat?: "srt" | "vtt";
  usedForDirectorGuide: boolean;
};
```

**Validación:** números finitos, fin > inicio, duraciones razonables, tolerar gaps y varios cues simultáneos cuando formato lo permite, no cambiar orden silenciosamente, rechazar archivos enormes que agoten memoria, eliminar etiquetas HTML peligrosas/estilos WebVTT activos, sanear texto para overlay HTML, mantener saltos de línea. Resolver duplicados y timing real por relojes de video (no suponer FPS 30), safe areas y edición móvil. Normalizar offsets antes de pasar segmentos al Director.

**Test de aceptación iPhone/editor:**
1. Importar SRT generado en app externa con 3 cues (00:00:01,500 / 00:00:04,000 / 00:00:12,000) y VTT equivalente, mostrar segmentos en C1; el video/voz original no se toca. Guardar/reabrir y deshacer corrección de texto/tiempo.
2. Director buscar «puerto» en texto importado, sugerir salto al rango correcto y corte, mostrar evidencia temporal. Sin subtítulos no afirmar que ese texto existe. Si subtitle desfasado +2s, ajustar pista y comprobar que Director respeta tiempo nuevo.
3. Simular SRT malicioso con comandos embebidos, texto HTML y tiempos imposibles; mostrar texto de forma segura, no ejecutar ni alterar proyecto. Archivos privados no salen a nube sin consentimiento.
4. Generar STT desde pista vocal cuando se cuente con motor real, cancelar proceso sin dejar pistas falsas; no prometer traducción ni STT offline hasta prueba.
5. Export subtítulos básicos en lienzo vertical 9:16 y horizontal 16:9 dentro de safe areas, con preview y export consistentes; importar desde Archivos iPhone físico.

**Prioridad respecto a roadmap:** P0 para modelo captions e importación local SRT/VTT cuando editor multipista y export existan; P1 para STT usable (básico, si viable) y enlace Director→captions; P2 postergado para traducción/estilos IA. **No detiene el objetivo P0 verdadero: multipista y render/export confiables.** Coordinar en PR #44 Claude, no crear otro editor ni modificar captura/LIVE por captions.

— ChatGPT
