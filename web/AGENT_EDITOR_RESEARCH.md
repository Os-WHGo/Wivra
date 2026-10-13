# AgentCut · primera etapa: editor móvil observable y controlable por IA
**2026-10-13 · — ChatGPT**  
**Estado:** esta rama implementa un experimento de **control táctil + planificador por reglas + observación visual liviana**, NO un LLM conectado. Es hija de [PR #5](https://github.com/Os-WHGo/agentcut/pull/5), que sigue **sin validación en iPhone/Android**. PR separado para Claude, sin fusionar `main`.

## Requisito del propietario: qué significa «la IA ve y edita»

**Prioridad 1:** un usuario desde el teléfono importa un video (local, después Drive/Photos/iCloud), el agente **lee de forma autorizada su contenido multimedia real y metadatos**, entiende las instrucciones (ChatGPT, Claude, Muse o IA local), propone mínimos ajustes por defecto, aplica cortes/textos/subtítulos mediante herramientas locales verificables y exporta un archivo **sin modificar el original**.

**Prioridad 2:** flujo rápido por niveles, capaz de trabajar con cientos de archivos sin leer cada fotograma, subir videos enteros o bloquear el móvil. **No** prometer magia: modelo de visión/voz todavía debe integrarse y medirse. La arquitectura web/nativa/híbrida **no está decidida** por el propietario; el experimento web existe para aprender sin computadora, no porque sea requisito final.

### Implementado en esta rama (código, no probado en teléfono)

- `web/agent-core.mjs`: protocolo simple de herramientas deterministas: `set_trim`, `set_text`, `set_audio`, `set_resolution`, proyecto inspeccionable, validador y sugerencias basadas en medidas. **No admite órdenes arbitrarias o URLs remotas**.
- `web/index.html`: usuario dicta/teclea una instrucción sencilla; aparece **plan para aprobar**; tras aprobación se actualizan los controles del editor, con **deshacer**. Ejemplo: `Recorta desde 2 hasta 8 y pon texto "Vancouver"`. **Esto es parser local por reglas, no ChatGPT ni Claude.** «Haz el mejor Reel» no se simula.
- `web/agent-vision.mjs`: muestrea solo 8 fotogramas reducidos a ~96 px, calcula luminancia/variación visual y propone **tres intervalos candidatos** con base en cambios de imagen. **No entiende personas, calles, voz, conversaciones, GPS, ni es un modelo semántico**. Puede omitir eventos; no subir fotogramas.
- `web/tests/agent-core.test.mjs`: herramientas, privacidad y estado, errores, escenas. `web/tests/smoke.mjs` actualizado para validar ambos scripts sin red. Workflows de CI. **No se ha medido aún tiempo en iPhone ni se ha validado exportación de video.**

**Limitación urgente:** la exportación anterior de PR #5 usa MediaRecorder en tiempo real. Claude detectó posibles problemas de sonido Safari, descarga y audio; no declarar lista la app. Este PR **no resuelve** esas limitaciones.

## Plan de "visión real" sin demorar un año por video

```
Usuario permite 1–N archivos o carpeta
        ↓
Índice incremental local (duración, resolución, códec, audio, fechas)
        ↓
Muestreo visual de baja resolución (8→20 frames/adaptativo) + escenas
        ↓
Audio: VAD (detecta tramos hablados) ──► ASR solo en tramos útiles
        ↓
OCR de letreros: solo frames con nitidez + alto valor informativo
        ↓
Metadatos de ubicación (SI EXISTEN) → coordenadas→ mapa/reverse geocode autorizado
        ↓
Extractor de evidencias locales: timecodes + textos + señales + fotogramas
        ↓
Modelo local ligero O IA en nube (consentimiento por cada envío)
        ↓
Plan estructurado + explicación + confianza/errores
        ↓
Editor aplica herramientas locales y muestra revisión rápida
        ↓
Exportación y verificación A/V desde origen, sin inflar resolución
```

**Innovación propuesta (investigación y diseño, no patentabilidad declarada):** *Evidence-First AgentCut Pipeline*:
1. **Dos pasadas:** paso ligero sobre todos los videos, segundo análisis más profundo solo sobre fragmentos candidatos. No enviar ni procesar 30 FPS completos con visión LLM.
2. **Muestreo adaptativo:** 1 frame cada varios segundos para videos estáticos, más densidad cuando hay cortes, movimiento, texto, voz o marcadores manuales. Medir cambios visuales, no confundir cámara moviéndose con escena interesante.
3. **Audio antes que visión costosa:** VAD barato en energía para ubicar frases; transcribir sólo segmentos relevantes, después OCR/visión para corroborar lo que se dice.
4. **Caché incremental por fingerprint + revisión:** no volver a analizar el mismo clip si solo cambia un título o una posición de texto; invalidar si el archivo cambia.
5. **Contexto pequeño, con procedencia:** enviar al modelo `{assetId,startMs,endMs,transcript,observedText,gpsSource,sceneScores}` y pocas miniaturas elegidas (opt-in para nube), no el video entero. El análisis de audio e imagen puede ser personal: pedir permiso por categoría.
6. **Aceleración del dispositivo** (VideoToolbox/Core ML/Metal en iOS; MediaCodec/NNAPI o GPU en Android; WebCodecs/WebGPU cuando corresponda), modelos cuantizados sólo si funcionan en hardware.
7. **Límites por batería, térmica y RAM:** tope de archivos/frames/modelos simultáneos, cancelación, reanudar, caché acotada y trabajo por lotes. No hacer funcionar un encoder mientras otro modelo grande agota el móvil.
8. **Latencia observable:** medir importación, índice, primer candidato, ASR, OCR, plan, exportación y tamaño de RAM. Objetivo de diseño «primera sugerencia útil pronto», **sin prometer tiempos no medidos**.

**Lo que NO se puede afirmar sin fuente:** que hay GPS en el MP4 solo por estar en una calle; que un letrero permite identificar una calle única; que escenas cambiantes son las mejores; que vision LLM es gratis/offline para 300 videos; que la app ya está acelerada por hardware. El video puede no incluir geolocalización, cámaras Ray-Ban y exportaciones pueden suprimirla. Para calles: usar GPS+timestamp si está presente y geocoding permitido, con nivel de incertidumbre; si no existe GPS, OCR de señales + contexto visual y revisión humana, **no inventar calle**.

## Repositorios y APIs investigados (candidatos, NO integrados aún)

Licencias de la columna comprobadas por metadatos de GitHub (2026-10-13) para el repositorio, **no automáticamente para todos los pesos/modelos/binarios**. Ninguna recomendación significa «probado en iPhone». Las licencias de algunos servicios son comerciales, no software libre.

| Categoría | Proyecto/URL | Licencia repo | Qué resuelve / advertencia |
| --- | --- | --- | --- |
| Contenedores multimedia | [Mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | Demux/mux/media navegador; medir Safari y exportación |
| Motor de edición | [WebAV](https://github.com/WebAV-Tech/WebAV) | MIT | WebCodecs; Safari sin verificar |
| Editor referencial | [OpenCut](https://github.com/OpenCut-app/OpenCut) | MIT | El arrastre de clips no funcionó en prueba táctil registrada en issue #1 |
| Motor alternativo | [Concat](https://github.com/jub0t/Concat) | AGPL-3.0 | Rust / MCP / multiplataforma; cuidado con condiciones AGPL al copiar |
| Composición navegador | [Diffusion Studio core](https://github.com/diffusionstudio/core) | MPL-2.0 | Motor WebCodecs; **términos comerciales/marca de agua de distribución por revisar** |
| Conversión WASM | [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | MIT del wrapper | FFmpeg compilado tiene licencias independientes; memoria móvil |
| Audio en navegador | [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) | BSD-3-Clause | Vistas de ondas; no transcribe |
| ASR local | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | MIT | Voz a texto; pesos/licencias/rendimiento aparte |
| ASR web de ejemplo | [whisper-web](https://github.com/xenova/whisper-web) | MIT | Referencia para demo, mantenimiento comparativamente antiguo |
| Voz detectada | [silero-vad](https://github.com/snakers4/silero-vad) | MIT | Detecta voz/silencios, **no reconoce palabras** |
| Modelo web multimodal | [transformers.js](https://github.com/huggingface/transformers.js) | Apache-2.0 | ASR, visión, embeddings, modelos pequeños; WebGPU/WASM y pesos aparte |
| Runtime | [ONNX Runtime](https://github.com/microsoft/onnxruntime) | MIT | Optimización local de modelos |
| Runtime móvil | [LiteRT](https://github.com/google-ai-edge/LiteRT) | Apache-2.0 | Inferencia acelerada nativa; model sizes y API Swift por probar |
| Visión en tiempo real | [MediaPipe](https://github.com/google-ai-edge/mediapipe) | Apache-2.0 | Modelos tareas visión y audio; assets/licencias separadas |
| Runtime navegador | [WebLLM](https://github.com/mlc-ai/web-llm) | Apache-2.0 | Modelos de lenguaje local en WebGPU, compatibilidad iPhone y memoria por probar |
| Modelo local nativo | [llama.cpp](https://github.com/ggml-org/llama.cpp) | MIT | LLM cuantizado local; tool calling real por medir |
| OCR de letreros | [Tesseract.js](https://github.com/naptha/tesseract.js) | Apache-2.0 | Texto en imágenes; errores en movimiento/noche |
| Metadatos imágenes | [exifr](https://github.com/MikeKovarik/exifr) | MIT | EXIF de fotos, **no asumir que extrae GPS de todo MP4/MOV** |
| Metadatos completos | [ExifTool](https://github.com/exiftool/exiftool) | GPL-3.0 indicado por ese mirror | Útil para MP4/MOV; integración móvil y licencia específica por auditar |
| Wrapper de escritorio | [exiftool-vendored.js](https://github.com/photostructure/exiftool-vendored.js) | MIT del wrapper | Usa procesos Node/ExifTool, **no navegador de iPhone** |
| Corte escenas | [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | BSD-3-Clause | Referencia Python/OpenCV; no instalar Python en móvil por defecto |
| ML web genérico | [TensorFlow.js](https://github.com/tensorflow/tfjs) | Apache-2.0 | Modelos pequeños posibles; comparar huella con ONNX |
| Streaming IRL iOS | [Moblin](https://github.com/eerimoq/moblin) | MIT | Referencia de cámara IRL, fuera de MVP editor |
| Gestión hardware | [Android Media3](https://developer.android.com/media/media3/transformer) / [Apple AVFoundation](https://developer.apple.com/av-foundation/) | Apache-2 / Apple APIs propietarias | Exportación nativa / hardware, arquitectura pendiente |

### Reconocer calles y lugares: respetar datos y límites

- Primero buscar GPS **con metadatos reales** del archivo MP4/MOV/foto o permiso actual explícito. Solo si existe convertir coordenadas a lugar mediante geocoding, mostrar probable, no cierto.
- [Google Maps reverse geocoding](https://developers.google.com/maps/documentation/geocoding/reverse-geocoding) tiene costos, atribuciones y restricciones de caché por términos. [OpenStreetMap Nominatim público](https://operations.osmfoundation.org/policies/nominatim/) **no sirve de backend masivo gratis** para cientos de videos: límites y prohibición de consultas sistemáticas; si se elige OSM considerar datos locales con licencia ODbL o un proveedor compatible, revisando derechos.
- OCR con Tesseract.js sólo propone nombres de calles cuando un letrero sea legible. Validación contextual por IA opcional; nombres de lugares/edificios similares no se fusionan sin evidencia.
- No identificar personas por cara ni usar reconocimiento de ubicación sensible automáticamente.

## Pruebas de aceptación para la primera etapa

1. Abrir **URL HTTPS de prueba** en Safari iPhone, importar clip ~22s con audio. Todavía no publicada ni verificada.
2. Escribir **`Recorta desde 2 hasta 8 y pon texto "Vancouver"`**, ver plan, aprobar, comprobar inicio/fin/título del mismo editor.
3. Deshacer, volver a aplicar; orden desconocida debe responder honestamente que no la entiende.
4. Pulsar «Observar escenas»: muestreo de **8 fotogramas** sin subir el video; mostrar 3 posibles instantes. Confirmar que el avance es correcto y no congela el teléfono.
5. Seleccionar un candidato, aprobar recorte, **exportar un MP4 o WebM real**; abrirlo fuera del editor, verificar que los segundos, audio y texto son correctos.
6. Añadir luego *modelo semántico* y VAD/ASR; **sin ese paso no hay IA que 'vea' y entienda lo ocurrido**.
7. Medir tiempos, datos transferidos (ideal 0 para flujo local), pico de RAM/temperatura y rendimiento con 3 clips (estático, movimiento, noche). Luego decidir la tecnología.

**Dependencia inmediata:** [PR #5](https://github.com/Os-WHGo/agentcut/pull/5) es base de esta rama y no está mergeado; esta PR debe usar como base la rama de PR #5 para no duplicar commits. El propietario decide cuándo fusionar. **Siguiente paso real:** URL HTTPS para ensayo en iPhone, después un LLM y una visión/OCR/ASR evaluadas en teléfono.

— ChatGPT
