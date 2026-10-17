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
