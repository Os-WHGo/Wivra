# AgentCut · editor + agente que observa video: investigación y continuidad
**2026-10-13 · — ChatGPT**
**Estado:** módulo local de observación integrado en la **app de Claude, no un núcleo rival**. PR de esta rama depende de [PR #30](https://github.com/Os-WHGo/agentcut/pull/30), cuyo núcleo depende de [PR #29](https://github.com/Os-WHGo/agentcut/pull/29). Nada se fusionó a `main`. El propietario **no decidió web-only**.

## Objetivo que debe gobernar el desarrollo

1. Seleccionar videos **desde iPhone/Android** (Fotos/Archivos, después Google Drive/Google Fotos/iCloud y bibliotecas autorizadas). No subir originales completos a la nube por defecto.
2. **La IA debe VER, ESCUCHAR y COMPRENDER el video** mediante evidencia multimedia real, además de leer los metadatos que existan: imagen, conversación/voz, texto de letreros y, si hay GPS, ubicaciones. No afirmar reconocimiento si el análisis no lo hizo.
3. Usuario: «elige los mejores momentos de mi recorrido, recorta silencios, agrega subtítulos y un gancho» → IA ChatGPT, Claude, Muse u opción local produce **operaciones verificables** sobre proyecto local → editor ejecuta → usuario revisa cambios mínimos y exporta.
4. Escalar a ~300 videos/~200 GB en teléfono usando análisis **progresivo**, thumbnails, VAD, modelos comprimidos, media proxies y codificadores hardware. Primero conseguir **un clip con exportación real probada**.
5. Streaming y IRL offline/online se conectarán después con el mismo proyecto y agente editor, no bloquean esta primera fase.

## Hechos de esta entrega

- La app de [PR #30](https://github.com/Os-WHGo/agentcut/pull/30) importa video local, permite cortes y textos con un núcleo común en `core/`, con operaciones atómicas, revisión y deshacer. Admite intercambio manual de JSON con ChatGPT/Claude **sin clave**. No exporta video.
- **Nuevo en esta rama:** `app/vision.mjs` lee hasta **ocho fotogramas reales** pequeños desde el `<video>` local, mide diferencias de luminancia/píxeles y propone puntos de **cambio visual probable**. Se muestran miniaturas locales de esos instantes y botones que preparan los campos de corte. El usuario confirma con el núcleo de Claude; **no se modifican archivos originales**.
- `app/prompt.mjs` añade al mensaje copiable para Claude/ChatGPT **solo métricas numéricas por escena** y advertencias. **No copia miniaturas ni bytes de video**. Esa información no demuestra que el LLM haya «visto» las escenas de manera semántica.
- `app/build.mjs` prepara una página HTML autónoma en `app/dist/agentcut.html` incluyendo el núcleo de Claude y el observador, sin descargas de dependencias. Tests en `app/tests/vision.test.mjs` y workflow.
- **NO realizado:** OCR, reconocimiento de lugares/edificios, reconocimiento de voz, GPS de MOV/MP4, modelo vision-language, modelo de lenguaje conectado automáticamente, exportación con audio, prueba en Safari real. No presentar esta rama como IA de visión completa.

## Repositorios candidatos: cribado de licencias (metadatos GitHub 13 octubre 2026)

**Bibliotecas y editores**

| Proyecto | Licencia repo | Para qué / limitación |
| --- | --- | --- |
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | Demux/mux de video en navegador; Safari real por probar |
| [WebAV](https://github.com/WebAV-Tech/WebAV) | MIT | WebCodecs y composición |
| [OpenCut](https://github.com/OpenCut-app/OpenCut) | MIT | Referencia; drag and drop falló en una prueba iPhone del issue #1 |
| [Concat](https://github.com/jub0t/Concat) | AGPL-3.0 | Motor nativo Rust/MCP; revisar AGPL antes de reutilizar |
| [DiffusionStudio/core](https://github.com/diffusionstudio/core) | MPL-2.0 | Composición en navegador; términos de exportación comercial por revisar |
| [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | MIT wrapper, FFmpeg separado | Procesamiento wasm; memoria de iPhone puede limitar |
| [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) | BSD-3-Clause | Formas de onda y eventos |
| [Android Media3 Transformer](https://developer.android.com/media/media3/transformer) | Apache-2.0 | Edición/aceleración de dispositivo |
| [Apple AVFoundation/VideoToolbox](https://developer.apple.com/av-foundation/) | API propietaria del SO | Procesamiento y codificación nativa iOS |

**IA local, voz, visión, metadatos**

| Proyecto | Licencia repo | Para qué / limitación |
| --- | --- | --- |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | MIT | ASR local; datos de modelos aparte |
| [Silero VAD](https://github.com/snakers4/silero-vad) | MIT | Detección de voz/silencios, no transcribe |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Apache-2.0 | Modelos de audio, imagen, NLP en navegador; licencia de cada modelo |
| [whisper-web](https://github.com/xenova/whisper-web) | MIT | Demo browser ASR, revisar mantenimiento |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | MIT | Ejecutar y acelerar inferencia |
| [LiteRT](https://github.com/google-ai-edge/LiteRT) | Apache-2.0 | Inferencia móvil nativa |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) | Apache-2.0 | Visión/audio en tiempo real; modelos aparte |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | MIT | LLM local pequeño cuantizado; no asumir tool calls fiables |
| [WebLLM](https://github.com/mlc-ai/web-llm) | Apache-2.0 | LLM WebGPU, Safari/modelos y memoria por medir |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | Apache-2.0 | OCR local de letreros; precisión de imágenes en movimiento limitada |
| [exifr](https://github.com/MikeKovarik/exifr) | MIT | EXIF para fotos, no asegura GPS en MP4 |
| [ExifTool](https://github.com/exiftool/exiftool) | GPL-3.0 según metadata de repositorio | Investigación de tags MP4/MOV; no usar binario escritorio en browser |
| [exiftool-vendored.js](https://github.com/photostructure/exiftool-vendored.js) | MIT del wrapper | Usa Node + binario ExifTool, no Safari directamente |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | BSD-3-Clause | Algoritmos corte de escena como referencia; Python no móvil directamente |
| [TensorFlow.js](https://github.com/tensorflow/tfjs) | Apache-2.0 | Alternativa ML web; comparar memoria con ONNX |

Estos proyectos **no están incluidos como dependencias** en esta entrega. Repositorio OSS ≠ licencia de modelos, datos, patentes ni distribuciones; ninguna biblioteca está verificada como funcional en iPhone del propietario. La lista se amplía en [PR #27 de Claude](https://github.com/Os-WHGo/agentcut/pull/27).

## Análisis rápido: «Evidence-first AgentCut Pipeline» (idea de I+D)

```
indexar 300 activos sólo con metadatos autorizados (sin descargar todo)
 → muestreo 6–20 fotogramas por clip y primer detector de escenas
 → VAD sobre tramos candidatos
 → Whisper ASR sólo donde haya voz
 → OCR sobre pocos fotogramas legibles (carteles y nombres)
 → localización si EXIF/QuickTime GPS existe, con precisión declarada
 → fragmentos de evidencia asociados a assetId/startMs/endMs
 → IA local ligera o IA cloud con permiso (no video completo)
 → plan estructurado con herramientas / validador de PR #29
 → revisión mínima del usuario → exportador del teléfono
```

**Ventaja:** la IA no recorre con visión multimodal los 30 o 60 fotogramas de cada segundo de 200 GB de videos. Se analizan **eventos** y se profundiza sólo cuando hay indicios. Caché por hash/revisión de origen, cancelación, límites de RAM, batería y temperatura. Medir latencia y precisión, no prometer una duración sin pruebas. Muestreo escaso puede perder un acontecimiento de un segundo; adaptar densidad cuando haya señales. Si faltan datos, mostrar «no verificado» en vez de inventar dónde ocurrió.

**Calles y lugares:** GPS del video no siempre existe. Con GPS autorizado puede usarse reverse geocoding sujeto a políticas y costo ([Google](https://developers.google.com/maps/documentation/geocoding/reverse-geocoding)); la API pública [Nominatim OSM](https://operations.osmfoundation.org/policies/nominatim/) **no autoriza indexación masiva arbitraria**, no usarla como backend genérico gratuito. Alternativa OSM local/self-hosted o proveedor licenciado si escala, respetando ODbL. OCR de nombres legibles y metadatos deben aportar evidencia; no adivinar calles sólo por apariencia.

## Qué falta para la primera entrega útil

1. Validar el **app/dist/agentcut.html** en iPhone real: vídeo de 22s, core JSON, observar 8 frames, seleccionar propuesta de corte, deshacer, audio/temperatura.
2. Integrar la **exportación de video y audio** del [PR #5](https://github.com/Os-WHGo/agentcut/pull/5), o un backend que lo haga de forma fiable; no pueden quedar dos apps rivales sin unificar.
3. Añadir reconocimiento **de voz real** con VAD+Whisper según capacidades del móvil y comprobar tiempos.
4. Añadir OCR y un modelo de visión real para escenas *seleccionadas*, no todos los frames.
5. Conectar proveedor LLM (OpenAI, Claude, Muse, local) con el mismo contrato del core y aprobación granular. El modo copiar/pegar permite usar IA de chat sin API pero el usuario debe mover el texto y la IA no ve imágenes.
6. Probar formato original (Ray-Ban Meta, MOV/HEVC, 3K/4K/60 FPS), memory peak, batería y calidad exportada. No trabajar con los 300 archivos hasta pasar prueba con tres clips.

**Para Claude:** este PR complementa tu #30/#29, reutiliza tu editor/núcleo, **no instala otro motor de operaciones** y respeta que el propietario decide la arquitectura. Revisar `app/vision.mjs`, UI y límites del prompt antes de integrar.

— ChatGPT
