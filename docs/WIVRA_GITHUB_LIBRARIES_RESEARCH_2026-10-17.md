# Wivra | Candidatos de repositorios GitHub para IA y audiovisual
**Investigación:** 2026-10-17. **Estado:** solo evaluación documental; no instalado, no descargados pesos, no merge.
**Rama:** `chatgpt/wivra-unified-owner-20261016` (PR #131). Proyecto Cero mantiene el catálogo transversal; esta evaluación corresponde únicamente a Wivra.

## Criterio
**A:** primer piloto tras certificar beta. **B:** evaluar después o ante falla comprobada. **C:** referencia de arquitectura/algoritmos. **D:** no integrar por ahora. Licencias de repositorios no bastan: revisar pesos, datasets, dependencias, codecs, avisos y términos comerciales. Compatibilidad declarada no equivale a prueba en hardware Wivra. GitHub `pushed_at` indica actividad del repositorio, no liberación validada.

## Matriz de investigación
| Proyecto | Uso posible en Wivra | Código/licencia identificada | Veredicto y condición |
|---|---|---|---|
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | ASR offline, VAD, diarización y reducción/separación de audio iOS/Android | Apache-2.0 | **A:** comparar modelos y rendimiento con whisper.cpp |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Transcripción/subtítulos y segmentación verbal | MIT | **A:** ya catalogado; tiempos por palabra vs segmento, tamaño, CPU |
| [Argmax OSS Swift (WhisperKit)](https://github.com/argmaxinc/argmax-oss-swift) | Whisper/CoreML iOS | MIT + terceros | **A/B:** alternativa Apple sin asumir soporte Android (Pro ≠ OSS) |
| [Silero VAD](https://github.com/snakers4/silero-vad) | Distinguir voz de ruido/pausas | MIT | **A:** VAD no transcribe; probar ONNX y baterías |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | Límites entre tomas y transiciones | BSD-3-Clause | **A:** portar heurísticas; Python no va directo a apps móviles |
| [Media3](https://github.com/androidx/media) | Transformer y exportación nativa Android | Apache-2.0 | **B:** completar/depurar editor existente antes de cambiar |
| [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | Esquema interoperable de timeline | Apache-2.0 | **B:** referencia, no otro editor |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) | Detección visual local y objetos | Apache-2.0 | **B:** tareas/modelos; auditar métricas y privacidad |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Inferencia modelos móvil | MIT | **B:** runtime, no IA audiovisual independiente |
| [LiteRT](https://github.com/google-ai-edge/LiteRT) | Inferencia GPU/NPU dispositivo | Apache-2.0 | **B:** elegir un runtime por modelo, evitar redundancia |
| [RNNoise](https://github.com/xiph/rnnoise) | Viento/ruido de voz | BSD-3-Clause | **B:** probar pérdida de calidad y consumo |
| [libebur128](https://github.com/jiixyj/libebur128) | Normalización sonoridad LUFS / true peak | MIT | **B:** comparar con módulo loudness existente |
| [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) | Forma de onda y marcadores en interfaz HTML | BSD-3-Clause | **B:** evaluar WebView, memoria, accesibilidad |
| [FFmpegKitNext](https://github.com/arthenica/ffmpeg-kit-next) | Encoder, muxer, filtros y formatos iOS/Android | LGPL-3.0 (GPL-3.0 según build) | **B:** reemplazo activo de FFmpegKit retirado, requiere compilación propia |
| [Auto-Editor](https://github.com/WyattBlue/auto-editor) | Algoritmos de silencio, actividad, cortes | Unlicense repo | **C:** CLI escritorio, funcionalidades con licencia/clave según build |
| [TransNetV2](https://github.com/soCzech/TransNetV2) | Detección neural de cambios de plano | MIT | **C:** push 2023, modelo/dataset requieren evaluación |
| [WhisperX](https://github.com/m-bain/whisperX) | Alineación por palabras y diarización | BSD-2-Clause | **C:** Python pesado; buena referencia de marcas temporales |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | ASR con CTranslate2 | MIT | **C:** orientado Python/CPU/GPU desktop |
| [Moonshine](https://github.com/moonshine-ai/moonshine) | ASR streaming local multiplataforma | Código MIT; modelos varían | **B:** pesos streaming MIT por defecto, *legacy* multilingües enumerados restringidos |
| [OpenCV](https://github.com/opencv/opencv) | Histograma, movimiento y calidad visual | Apache-2.0 | **B/C:** incorporar solo si justifica tamaño y complejidad |
| [MetalPetal](https://github.com/MetalPetal/MetalPetal) | Filtros GPU Metal iOS | MIT | **B:** último push observado 2024; medir soporte real |
| [GPUImage3](https://github.com/BradLarson/GPUImage3) | Filtros iOS | BSD-3-Clause | **C:** alternativas API nativa antes |
| [HaishinKit Swift](https://github.com/HaishinKit/HaishinKit.swift) | RTMP/SRT LIVE Apple | BSD-3-Clause | **B:** si falla módulo LIVE nativo |
| [HaishinKit Kotlin](https://github.com/HaishinKit/HaishinKit.kt) | RTMP LIVE Android | BSD-3-Clause | **B:** no duplicar streaming |
| [RootEncoder](https://github.com/pedroSG94/RootEncoder) | RTMP, RTSP, SRT y filtros LIVE Android | Apache-2.0 | **B:** opción para rutas nativas |
| [Meta DAT iOS](https://github.com/facebook/meta-wearables-dat-ios) | SDK oficial Ray-Ban, streaming, foto, permisos | Términos SDK Meta | **A:** cotejar integración actual; preview, no garantizar audio separado |
| [Meta DAT Android](https://github.com/facebook/meta-wearables-dat-android) | SDK oficial Ray-Ban Android | Términos SDK Meta | **A:** comprobar alcance exacto y consentimiento |
| [pysubs2](https://github.com/tkarabela/pysubs2) | SRT/VTT/ASS, desplazamiento subtítulos | MIT | **C:** Python, contraste de casos límite |
| [Spleeter](https://github.com/deezer/spleeter) | Separación voz/música | MIT | **C:** modelos/consumo móvil sin comprobar |
| [Demucs](https://github.com/facebookresearch/demucs) | Separación instrumentos | MIT | **D:** archivado enero 2025, pesado |
| [OpenCLIP](https://github.com/mlfoundations/open_clip) | Embeddings vídeo-texto para hallar temas | Licencias por componente/pesos | **B/C:** modelo preciso requiere auditoría |
| [MobileCLIP](https://github.com/apple-aiml-research/ml-mobileclip) | Búsqueda visual-textual eficiente | Código MIT; modelos Apple Research TOU | **D:** pesos sujetos a restricciones de investigación, no incluir en app comercial |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | Filtros, multiplexación, codecs | LGPL default / GPL según build | **C:** licencias de binarios, patentes, mantenimiento |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Embeddings/WebView inferencia | Apache-2.0 | **B:** ya catálogo central, medir WebGPU/Safari |
| [ExecuTorch](https://github.com/pytorch/executorch) | Runtime modelos PyTorch iOS/Android | BSD-3-Clause | **B:** ya catálogo central; escoger con benchmark |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | Director creativo textual privado | MIT | **B:** ya catálogo central, tamaño/memoria |
| [Ollama](https://github.com/ollama/ollama) | Inferencia en servidor | MIT | **D:** servidor, coste y privacidad fuera de beta |
| [Essentia](https://github.com/MTG/essentia) | BPM, ritmo y otros descriptores musicales | AGPL-3.0 | **C/D:** referencia con revisión legal |
| [aubio](https://github.com/aubio/aubio) | Beat/onset tracking | GPL-3.0 | **C/D:** referencia sin copiar |
| [Remotion](https://github.com/remotion-dev/remotion) | Render video programático | Licencia especial | **D:** restricciones para construir productos derivados |
| [FFmpegKit retirado](https://github.com/arthenica/ffmpeg-kit) | Antiguo wrapper móvil | LGPL-3.0 | **D:** archivado julio 2026; mirar FFmpegKitNext |
| [VideoLab](https://github.com/ruanjx/VideoLab) | Editor AVFoundation/Metal | MIT | **C:** último push 2022, no reemplazar editor actual |

## Flujo arquitectónico propuesto
```
MP4/MOV + audio integrado/WAV y offsets (local, sin subir)
  -> VAD / nivel de señal
  -> ASR y subtítulos temporizados
  -> detección de límites entre tomas
  -> múltiples intervalos candidatos con procedencia y confianza
  -> director interpreta pedido y decide ranking, longitud y composición
  -> operaciones validadas por core/operations.mjs
  -> propuesta en editor Wivra, revisión, aplicar y deshacer
  -> exportación existente
```

## Decisiones, bloqueos y límites
1. **Antes de instalar nada:** completar la beta, ensayos de emulador y equipos reales, captura Ray-Ban/cámaras, sincronía, LIVE, exportación e instaladores. No más motores pesados durante congelación.
2. **Después de beta:** comparar sherpa-onnx/whisper.cpp (Apple WhisperKit si justificado), VAD actual/Silero, escenas Wivra/PySceneDetect adaptado. Primero montaje multisegmento, luego visión semántica.
3. **Evidencia:** detector de transiciones no significa «mejor paisaje»; ASR sin alineación detallada no garantiza límites por palabra; los informes del usuario no son hechos observados.
4. **Tests requeridos:** ES/EN/PT/FR/DE/JA/ZH/IT, 45 min, memoria/energía/temperatura, interrupciones, HEVC/HDR, música+voz, viento, WAV con desfases positivos y negativos, privacidad y compatibilidad iPhone/Android real.
5. **Cumplimiento:** pin de versión/commit/sha256, licencia código+pesos+datos+dependencias, telemetría, patentes/códecs, llaves y consentimiento; sin gastos ni servicios pagados.
6. **Control Git:** solo PR #131, nunca merge a main ni reescritura de ramas colaboradoras. Documentación exclusiva de Wivra; Proyecto Cero ejecuta reorganización central cuando corresponda.

**Conclusión:** la diferencia técnica clave para «45 min caminando por Whistler -> 60 s» no es instalar otro editor, sino seleccionar varias ventanas de escenas/voz de un mismo vídeo y entregarlas como lote reversible al editor propio. Los motores externos siguen siendo candidatos, no funciones integradas.

## ANEXO: contraste con investigaciones de Claude y pruebas reales aisladas (17-10-2026)

**Clasificación de evidencia:** investigación técnica y comparativa; una ejecución REAL de Silero ONNX en CPU Linux; **ningún motor ASR/LLM/VAD se agregó a los binarios iOS o Android**. Las afirmaciones anteriores sobre "Whisper WASM ya integrado en rama Claude" no están corroboradas: el árbol actual del PR histórico #44 (`6333848e`) no tiene módulo ni peso Whisper identificable, al igual que la rama de integración de Wivra; el parser manual SRT/VTT sí funciona.

### Priorización por tarea, no por estrellas
| Tarea | Primera opción para POC aislado | Alternativa | Motivo y prueba aún necesaria |
|---|---|---|---|
| Detección de actividad de voz, AutoCut/Quitar silencios | Silero VAD ONNX | energía actual como fallback / sherpa-onnx VAD | **modelo REAL ejecutado** en Linux, controla ruido y tono, probar viento/música/teléfono |
| Transcribir y temporizar subtítulos de videos | whisper.cpp multilingüe | sherpa-onnx con un modelo multilingüe concreto | ambos modelos por instalar/probar en CI aislado y después dispositivos, WER/CER, marcas por palabra, RAM, tamaño, ocho idiomas |
| Transcripción en tiempo real/órdenes breves | sherpa-onnx o Moonshine streaming (pesos específicos) | WhisperKit Apple | evaluar latencia, idiomas y licencias, NO asumido como universal |
| Exportación rápida WebView | Mediabunny + WebCodecs en sandbox de CI | Media3 Android / AVFoundation Apple | reproducibilidad y compatibilidad WebView primero; no adoptar motor nuevo por nombre |
| Director creativo textual | validador actual + propuestas estructuradas locales | llama.cpp + Qwen cuantizado tras beta | memoria móvil, seguridad de operaciones, licencias y alucinaciones aún sin medir |
| Visión de escenas ligera | estadísticas de fotogramas existentes, histogramas PySceneDetect adaptados | TransNetV2 | cambio de plano no significa mejor paisaje; no instalar Python o red neuronal pesada en beta |

### Ensayo ejecutado: Silero ONNX real, modelo fijado
Fuente y script: https://github.com/Os-WHGo/Wivra/blob/chatgpt/wivra-unified-owner-20261016/tools/ai_benchmark_silero.py

CI: https://github.com/Os-WHGo/Wivra/actions/runs/39073016439 **SUCCESS**, artifact "Wivra-AI-Silero-CPU-Smoke-Only". Modelo oficial y audio oficial fijados a Silero commit 1e261b036686cd0017d500ee96acd1c4ba572a9d con validación de tamaño y blob. ONNX Runtime 1.22.1 + numpy 2.2.6 solo en job temporal. Nunca en app.
| Señal | Duración | Silero p(voz)>=0.5 | RMS fijo >0.03 | Tiempo de inferencia CPU |
|---|---:|---:|---:|---:|
| Voz del WAV oficial (sin transcripción de referencia) | 60 s | 77.44% | 46.13% | 0.2021 s |
| Silencio absoluto | 6 s | 0% | 0% | 0.0203 s |
| Tono 440 Hz | 6 s | 0% | 100% | 0.0202 s |
| Ruido aleatorio amplio | 6 s | 0% | 49.47% | 0.0201 s |

Proceso peak RSS: ~101704 KiB en CPU GitHub Actions Linux. El RMS de este ensayo es un umbral fijo de control, **no** el algoritmo adaptativo oficial de Wivra. El WAV oficial no tiene etiquetas de voz de referencia en nuestro benchmark; porcentajes NO son precisión, recall, WER ni CER. No se probó en Android/iPhone, con viento real ni español. Este resultado justifica continuar evaluación de Silero; **no demuestra que ya sea mejor en todo escenario**.

### Correcciones críticas a material investigado antes
1. La **Tenor API** está descontinuada para integradores desde el 30 de junio de 2026. Fuente oficial: https://support.google.com/tenor/answer/10455265?hl=es . NO integrarla aunque documentos históricos la recomendaran; no presupone que los memes de terceros sean redistribuibles.
2. **WhisperKitAndroid** es un proyecto archivado desde el 24 de enero de 2026. https://github.com/argmaxinc/WhisperKitAndroid . No introducirlo; evaluar solo su sucesor activo cuando se confirme disponibilidad/licencia. WhisperKit Apple sigue candidato distinto.
3. **Moonshine** fue actualizado: el repositorio y los modelos MIT por defecto incluyen streaming multilingüe, pero la lista de modelos legacy no streaming multilingües sigue con licencia restrictiva. https://github.com/moonshine-ai/moonshine/blob/main/LICENSE . No asumir "Moonshine español no comercial" para todos los modelos ni distribuir alguno sin fijar la versión concreta.
4. **Silero VAD LICENSE** oficial declara MIT: https://github.com/snakers4/silero-vad/blob/master/LICENSE . La advertencia de badges contradictorios de la biblioteca histórica requiere aclaración con los modelos/derivados exactos, pero NO invalida el LICENSE del repo original.
5. No copiar indiscriminadamente Memes/Imgflip, LUTs, sonidos Pixabay/Mixkit o GIFs. Verificar licencia por asset, redistribución, nombres e imagen/derechos de terceros. Evitar sustituir componentes Wivra actuales por Harbeth, VLCKit, MPVKit, FFmpegKit, OpenReel, OpenCut o Remotion sin déficit comprobado.
6. Investigación de Claude que SÍ ayuda sin reemplazar arquitectura: benchmark Mediabunny vs exportador; Playwright/WebKit de CI para smoke Safari aproximado; formato Agent Skills y skill-pack local existente; opciones específicas de HaishinKit/StreamPack para LIVE, tras ensayar el transporte ya implementado.

### Protocolo del siguiente ensayo de IA
Crear corpus público/consentido ES/EN/PT/FR/DE/JA/ZH/IT con transcripción humana de referencia, música y viento; ejecutar exacto mismo clip en whisper.cpp y sherpa-onnx con versiones y pesos licenciados, guardar WER/CER, timecodes, RTF, pico RAM, binario, temperatura si móvil; separar diarización y subtítulos. No proclamar "ganador absoluto" antes de comparar iguales. Cerrar beta probada antes de empaquetar motores pesados.

### Segundo ensayo ejecutado: whisper.cpp real ASR en CPU Linux (NO móvil)
- GitHub Actions: https://github.com/Os-WHGo/Wivra/actions/runs/39073410691 **SUCCESS** y artifact JSON Wivra-Whisper-CPU-English-Smoke-Only. Workflow: .github/workflows/wivra-whisper-cpu-smoke.yml.
- Fuente oficial code commit 0c7be696371069e0baa2515ed7aa08d5a5473aa6. Modelo tiny.en-q5_1 (~31 MiB), descargado solo en runner y SHA1 3fb92ec865cbbc769f08137f22470d6b66e071b6 comprobado; audio oficial samples/jfk.wav, Git blob SHA verificado 3184d372cd2f8b804d3a540c70ec50d927b335d2.
- Transcribió las 22 palabras del extracto JFK en **11.002 s** de audio: **WER 0.0000** contra esa frase conocida, **0.94 s** transcurridos incluyendo carga del modelo, **136212 KiB RSS** pico del proceso Linux CPU con dos hilos.
- Interpretación: un caso limpio en inglés especializado NO mide calidad ES/EN/PT/FR/DE/JA/ZH/IT ni robustez a viento/music/acentos. No valida marcas por palabra, batería, temperatura ni rendimiento Android/iPhone. No es comparación directa con sherpa-onnx. No se añadieron pesos ni IA a APK/IPA.
- Recomendación: whisper.cpp para primer POC ASR y Silero para VAD, pero no certificar hasta un corpus multilingüe igualado frente a sherpa-onnx y una auditoría de licencias/modelos.
