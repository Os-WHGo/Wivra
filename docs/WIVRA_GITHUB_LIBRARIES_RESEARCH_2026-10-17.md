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

### Resultados añadidos: Sherpa-ONNX/Moonshine v2 y libfvad (17-10-2026)

| Ensayo aislado | Evidencia | Resultado reproducible | Límite |
| --- | --- | --- | --- |
| sherpa-onnx 1.13.8 + Moonshine v2 tiny-en cuantizado | [Run #39080433942](https://github.com/Os-WHGo/Wivra/actions/runs/39080433942) SUCCESS; [fallo original #39080238074](https://github.com/Os-WHGo/Wivra/actions/runs/39080238074) | Modelo oficial SHA256 `9ec31b342d8fa3240c3b81b8f82e1cf7e3ac467c93ca5a999b741d5887164f8d` (29,858,559 bytes); mismo JFK de ~11 s; un pase continuo falló por `ONNX decoder Add broadcast 2 by 457`; en dos trozos de 5,5 s devolvió **WER 9,09 %**, ~0,0898 s inferencia excluida carga; fragmentado en 3 s, WER 31,82 %. Pico RSS del proceso ~216 MiB. | Modelo inglés, fragmentar altera el resultado; no comparación justa de velocidad/precisión contra Whisper continuo. No validado Android/iOS. |
| libfvad BSD-3-Clause (C, derivado de WebRTC) | [Run #39080541211](https://github.com/Os-WHGo/Wivra/actions/runs/39080541211) SUCCESS | Código upstream `532ab666c20d3cfda38bca63abbb0f152706c369` compilado en runner; mismo WAV público de 60 s de Silero, más tono/ruido/silencio. Modo agresivo: voz en 85,75 % ventanas, 0 % silencio, 100 % tono constante, 1,5 % ruido. 60 s procesados en ~0,011 s. Pico RSS ~55 MiB del proceso. | 30 ms por ventana vs 32 ms Silero, sin verdad de referencia, no precisión/recall; libfvad confunde tonos constantes con voz. Mantenimiento upstream relativamente antiguo (último push 2024). |

**Conjunto de decisiones basadas en estas cuatro pruebas de CPU**
- **Transcripción de video completo:** conservar Whisper.cpp como primera opción de prototipo; el demo de 11 s produjo WER 0 % en una cita limpia inglesa, pero no garantiza español/otros idiomas. Sherpa-ONNX sigue candidato de toolkit, no ganador por este único Moonshine inglés.
- **Pausas/AutoCut:** Silero VAD ONNX primera opción de prototipo por rechazar tonos y ruido de los controles mientras libfvad no rechaza tono sostenido. Ningún VAD tiene aquí métricas de precisión en voz etiquetada, música ni viento real.
- **Alternativa ligera:** libfvad podría servir en prototipos de activación de voz de baja potencia, previo ensayo de casos difíciles, licencia y soporte a futuro; no meterlo a la beta por ahora.
- **Moonshine no es una única licencia para todos los idiomas:** comprobar licencia específica de cada conjunto de pesos (algunos multilingües se distribuyen bajo términos comunitarios restrictivos). El inglés del paquete probado es MIT según la licencia del proveedor; los datos del paquete no se publicaron en Wivra.
- **Nuevo candidato evitado:** [TEN VAD](https://github.com/TEN-framework/ten-vad) muestra lenguaje Apache-2.0, PERO el [LICENSE](https://github.com/TEN-framework/ten-vad/blob/main/LICENSE) agrega prohibición de despliegue competitivo con ofertas de Agora, por lo que no se debe tratar como Apache-2.0 estándar ni incorporar sin revisión legal.
- Scripts y workflows solo de laboratorio: `tools/ai_benchmark_sherpa_moonshine.py`, `.github/workflows/wivra-sherpa-moonshine-cpu-smoke.yml`, `tools/ai_benchmark_libfvad.py`, `.github/workflows/wivra-libfvad-cpu-smoke.yml`. Descarga de materiales públicos en runner efímero con revisión de checksum y límite de tamaño. **Ningún modelo, peso o nueva biblioteca entra al APK/IPA**.
- Falta: corpus propio autorizado con transcripción humana ES/EN/PT/FR/DE/JA/ZH/IT, viento/música, tiempos por palabra, consumo térmico y batería, pruebas reales iPhone/Android y medición del tamaño final. Mantener el congelamiento funcional de beta.

### Anexo de revisión MU + catálogo Claude: exportación, editores y licencias (17-10-2026)

**Cambio de identidad:** MU es el coordinador antes conocido como Proyecto Cero. El repo histórico `Os-WHGo/Proyecto-Cero` permanece con ese nombre salvo decisión GitHub independiente. Este repo Wivra no incorpora ni cita rutas privadas de MU.

**Contraste fuente actual de Wivra:** `app/export.mjs` compone Canvas y `MediaRecorder` para exportar en tiempo real. Se comprobaron los export tests existentes y el estado de CI de la rama de integración; antes de reemplazar este motor, hace falta probar exportación real de video+WAV multipista+textos+transiciones, en hardware iOS y Android.

**Prueba aislada original con navegadores:** workflow `Wivra WebCodecs MediaRecorder isolated browser matrix`, [run #39097552558](https://github.com/Os-WHGo/Wivra/actions/runs/39097552558) **SUCCESS como ejecución de laboratorio, pero cobertura funcional PARCIAL**. `tools/browser-media-capability-probe.cjs` usa Playwright 1.56.1 en Ubuntu 24.04 y un Canvas local, no archivos del usuario:
- Chromium Linux headless 141: secure=true; `VideoEncoder`, `VideoDecoder`, `AudioEncoder` presentes. `VideoEncoder.isConfigSupported` reportó VP8 y VP9 true, H.264 avc1 false. Codificó cinco fotogramas VP8 (582 bytes) a través de WebCodecs. `MediaRecorder.isTypeSupported(video/mp4)` true, pero con ese codec MIME el intento produjo **0 chunks / 0 bytes** en ~600 ms. Un `isTypeSupported=true` no garantiza archivo útil.
- Playwright WebKit Linux: proceso/página se cerró durante `evaluate`; no se obtuvieron resultados seguros de WebKit. No se probó Safari de iPhone ni Android WebView nativo; Linux emulado no sustituye hardware. Esta ejecución NO es benchmark Mediabunny completo, exportación Wivra ni prueba de calidad A/V.
- Decisión técnica: MANTENER editor y exportador actuales hasta una comparación de archivos exportados real sobre móviles. Mediabunny MPL-2.0 es **CANDIDATO ALTERNATIVO**, no dependencia instalada; medir metadatos, reproducción, audio, latencia, tamaño, Safari/Android, soporte HEVC/HDR, software/hardware códec y licencia antes de adoptar.

**Revisión de tablas añadidas por Claude en MU**:
- `tangshuang/webcut` MIT, editor Vue/WebAV activo a 2026-09-21: referencia UX/linea de tiempo, NO motor Wivra; `wangrongding/WebCut` LGPL-3.0 (último push 2024), proyecto distinto; `thejupitergroup/WebCut` MIT (otro distinto). No registrar «webcut = LGPL» sin repositorio concreto.
- `Klippy` fuente completa no publicada gratis como AGPL: documentación comercial en https://www.klippy.pro/pricing anuncia licencia de pago por acceso; EVITAR para beta gratuita. `Kırmızı` no tiene URL/repositorio verificado, no instalar. `craftled/openklip` MIT contiene ideas de project.json/CLI/MCP pero **archivado** según GitHub; referencia únicamente.
- `vite-pwa/vite-plugin-pwa` MIT, `MikeMcl/decimal.js` MIT, `pocketbase/pocketbase` MIT, `inovector/mixpost` MIT y `gitroomhq/postiz-app` AGPL-3.0 son alternativas **para otros productos de MU**, no Wivra. Guía de Claude separa componentes pero no prueba licencias/transacciones/hosting. `Gemma 4` oficial Google Apache-2.0, POTENCIAL de Director futuro tras evaluar versión/pesos/recursos en móviles, no asumido gratuito en ejecución ni instalado.

**Punto de control de aceptación de beta:** compila APK debug + IPA iOS sin firma y la suite de emulador Android ha pasado en GitHub Actions para HEAD anterior; falta autorización/uso real iOS y Android, la firma/instalación y QA físico de cámara Meta, entrada de audio, WAV, exportación, persistencia y suspensión por interrupciones. Ningún merge a main.

## 18-10-2026 · Exportación del propio Wivra: prueba de integración en navegador, comparación con Mediabunny y corrección de bloqueos

**Código afectado:** `app/export.mjs` (MediaRecorder existente), `app/tests/export-recorder-cleanup.test.mjs`, `app/tests/export.test.mjs`. No se instaló Mediabunny ni FFmpeg dentro de APK o IPA. La fuente de verdad sigue siendo el editor único.

### Medidas reales, archivo sintético controlado
- [Run #39109679229](https://github.com/Os-WHGo/Wivra/actions/runs/39109679229) PASS: Wivra `recordProject` generó MP4 con video y audio, archivo ~63.976 B, reconocido/reproducido por Chromium; código de Chromium produjo `video/mp4;codecs=vp9,opus` al pedir MP4 sin códec, por lo que se evaluó alternativa explícita. Se rechazó correctamente la exportación si faltaba el WAV independiente.
- [Run #39110810571](https://github.com/Os-WHGo/Wivra/actions/runs/39110810571) PASS: el mismo exportador creó WebM VP8 + Opus a partir de fuente WebM y WAV sintetizado, 320×240. **ffprobe** comprobó ambos streams, **59 paquetes**, duración **1,293 s** calculada de timestamps porque MediaRecorder WebM no grabó duración total en cabecera; WebM **88220 bytes**. `MediaRecorder` y WebKit Linux tienen distintos soportes de códecs, por lo tanto no asumir estos resultados en Safari ni Android WebView reales.
- [Run #39110984291](https://github.com/Os-WHGo/Wivra/actions/runs/39110984291) PASS: misma exportación examinada con **Mediabunny 1.61.6**, sin integración a runtime: identificó video y audio, tamaño **320×240**, duración **1,23 s**, audio **48 kHz estéreo**, coherente con ffprobe. Licencia `MPL-2.0`. **Decisión:** útil como inspector/importador potencial, pero no sustituye exportación actual. No hemos medido su salida, rendimiento energético, flujo de memoria ni WebView móviles.
- [Run de PCM audible #83ea431](https://github.com/Os-WHGo/Wivra/actions/workflows/wivra-browser-media-matrix.yml): prueba adicional de decodificación PCM del audio Opus final, para distinguir pista presente de audio realmente no silencioso; revisar estado de la ejecución antes de elevarla a PASS.

### Problemas encontrados y corregidos
1. MediaRecorder.start() puede lanzar una excepción dejando `onstop` pendiente para siempre. `finishMediaRecorder` ahora solo espera si hubo inicio correcto y limita la espera a 12 s; incluso con fallo de stop se limpian audio, video, stream y listener de visibilidad. Además, constructor de MediaRecorder que rechaza un MIME anunciado ahora libera recursos tempranos.
2. Se evita preferir un MP4 ambiguo en Chromium: selección `H.264/AAC MP4 explícito → VP8/Opus WebM → VP9/Opus WebM → WebM genérico → MP4 genérico`. Safari mantiene opción MP4 si es la única. No garantiza compatibilidad con redes sociales; exportador informa extensión real.
3. El CI de prueba equivocadamente separaba una Data URL por la primera coma, aun cuando `codecs=vp8,opus` contenía coma en parámetros MIME. Se corrigió por delimitador `;base64,` y se verificó firma EBML `1a45dfa3`. Fallos anteriores de ffprobe derivados de esa copia corrupta NO deben usarse para afirmar fallo de Wivra.
4. ffprobe mostró WebM válido sin `format.duration` en cabecera. Ahora el análisis usa marcas de tiempo de paquetes para comprobar duración, no falla ante un campo opcional ausente.

### Aceptación y límites
- Con el último cambio de aplicación se añadieron seis casos de regresión: cierre normal, rechazo de inicio, grabador detenido, espera agotada, limpieza, constructor rechazado; última app suite consultada: **320/320** antes de incorporar la última comprobación de constructor, que debe revalidarse junto al HTML reconstruido.
- Quedan pruebas físicas HEVC de iPhone y Ray-Ban Meta, audio CAF/WAV con offset y desconexiones, overlays, subtítulos, exportación continua larga, tiempo real, memoria/temperatura, permisos de micrófono, interruptores del SO, reproducción y guardado en galería. Los tests Linux no validan ese hardware.
- No merge a main, no compras, no claves ni carpetas Drive privadas dentro de este documento, no dependencia Mediabunny instalada en las apps.

### 18-10-2026 · Prevención de WAV decodificables pero truncados (integración beta, sin nuevas dependencias)

- **Hallazgo**: que `decodeAudioData` lea un WAV no garantiza que el origen abarque el `[in,out]` solicitado por el clip de voz. Hasta ahora Wivra podía exportar un final de voz recortado sin avisar, incluso al tener el audio disponible en la memoria.
- **Corrección en `app/export.mjs`**: `exportAudioPreflight()` recibe opcionalmente `decodedAudioDurations`; `recordProject()` las obtiene de los `AudioBuffer.duration` reales. Por cada audio audible valida el `out` contra la duración disponible, convierte la pérdida a segundos del timeline con `speedOf(c)`, y devuelve `shortAudio` con `id`, `asset_id`, `role`, `secondsLost`. Exige confirmación antes de grabar, igual que una pista faltante; mantiene el consentimiento existente `allowIncompleteAudio` y evita falsos positivos de mute/ganancia cero.
- **Interfaz**: en `app/template.html` se informa el número de pistas demasiado cortas y su pérdida en segundos, indicando reimportar el WAV o recortar los tramos. El HTML embarcado se reconstruye por workflow oficial.
- **Pruebas de aplicación**: [GitHub Actions #39113526618](https://github.com/Os-WHGo/Wivra/actions/runs/39113526618) **SUCCESS** con **326/326** incluyendo audio corto, tiempo de origen exacto, speed, clips compartiendo un recurso y retrocompatibilidad de la firma pública.
- **Prueba real navegador**: [GitHub Actions #39113524242](https://github.com/Os-WHGo/Wivra/actions/runs/39113524242) **SUCCESS**. El WAV de control de 0,35 s se abre y decodifica, pero el clip pide `out=1,12 s`; la salida muestra `shortAudio:[{id:'a',secondsLost:0.77}]`, `missingAudio:[]`, `audioBlocked:true`, antes de `MediaRecorder`. Otro WAV completo sí produce WebM VP8+Opus con voz audible. Los primeros 100 ms resultan silenciosos y después suena audio en torno a offset 0,12 s. Los dos tramos de video son visualmente distinguibles en el archivo final (RGB naranja [160,100,5], azul [2,105,157]). El título fue invocado por el pipeline Canvas, sin OCR ni afirmación de fidelidad visual perfecta.
- **Automatización mejorada**: `.github/workflows/wivra-browser-media-matrix.yml` ahora se activa ante cambios en `tools/browser-export-roundtrip.cjs` y `app/export.mjs`, además de su propio YAML, para que modificaciones reales del exportador ejecuten la integración de formato y audio.
- **Android embedded editor**: se añadió comprobación en `streaming/android/app/src/androidTest/java/com/oswhgo/wivra/WivraEditorWebViewTest.java` contra la misma función compilada dentro de la WebView offline: rechazar WAV corto y permitir WAV suficiente. La instrumentación debe aprobar en el emulador nativo antes de declararse validada; ver [Wivra Complete Beta Assembly](https://github.com/Os-WHGo/Wivra/actions/workflows/wivra-complete-beta-assembly.yml).
- **Alcance**: se mantiene editor único, exportador Canvas/MediaRecorder y sus modelos nativos. No se instaló Mediabunny ni ningún motor ASR/VAD en APK/IPA. Falta hardware real iOS/Android/Ray-Ban, material HEVC/MOV, micrófonos externos y sincronía larga.

### 19-10-2026 · Protección de precisión temporal en montajes largos

El checkpoint de código de Wivra recibió dos mejoras defensivas para la beta (sin motores ni dependencias nuevas):

1. **`exportPlan(project)` conserva segundos sin redondear por segmento**. Antes truncaba cada duración y cada hueco a centésimas (`r2`) y omitía pausas menores de 50 ms. Repetido 200 veces, un montaje de 200 clips de 0,333 s con inicios separados 0,340 s perdía casi dos segundos del plan de exportación, afectando video, voz independiente, música y títulos. Ahora mantiene duraciones fraccionarias y todos los huecos positivos; los redondeos se reservan a la presentación.
2. **`validateMainVideoExport(project)` rechaza superposiciones pequeñas acumuladas**. Se mantiene una tolerancia máxima de 5 ms por unión para errores aislados de ajuste, pero se limita a 50 ms la suma de esas tolerancias en todo el montaje. Sin ese tope, centenares de solapes de 3 ms sumarían un desplazamiento perceptible del audio. Un solape principal mayor sigue rechazándose antes de grabar; los videos superpuestos y pistas WAV siguen independientes.

**Pruebas verificadas:** [App Tests #39237226801](https://github.com/Os-WHGo/Wivra/actions/runs/39237226801) completó **340/340** para el cambio de precisión del planificador. [Browser Media Matrix #39237218601](https://github.com/Os-WHGo/Wivra/actions/runs/39237218601) pasó con el exportador real, WAV separado, dos escenas, ffprobe/Mediabunny y controles de error previos. El test `app/tests/export.test.mjs` añade un montaje de 200 cortes, pausas de 7 y 40 ms, preservación del plan exacto, duraciones de fotos/audio y la prueba de suma de solapes. **La prueba del límite acumulativo se incorporó en el commit `de650ea0` y su CI se revisa por separado, no se presupone aprobada**.

**Compatibilidad y límites:** No se cambió la composición Canvas/MediaRecorder, no se fusionó `main`, no se añadió modelo ASR/VAD ni un exportador nuevo. Esta verificación prueba la planificación temporal y su ejecución sintética en Chromium/Linux, no asegura precisión de presentación de cada fotograma con intervalos menores que una frecuencia de refresco, ni rendimiento/disponibilidad de formatos en iPhone/Android físicos o Ray-Ban. La beta física continúa pendiente.
