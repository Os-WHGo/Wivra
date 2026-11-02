# Wivra P0-W · Reutilización real de motor WebCodecs + Mediabunny (01-11-2026)

## Decisión del propietario y límites

El propietario APROBÓ integrar la alternativa más rápida descubierta por Claude, **sujeta a pruebas**, sin retirar el exportador anterior y priorizando un editor móvil funcional. Claude midió el prototipo en Chromium Linux, no en iPhone/Android físicos: ~8,5x vs 0,99x tiempo real en 60 s, audio/video 8 ms vs 60 ms; no se extrapolan velocidades a un teléfono. Referencias: `docs/WIVRA_EXPORT_ENGINE_MEGABLOCK_2026-10-30.md`, `docs/WIVRA_HANDOFF_CHATGPT_EXPORT_2026-10-31.md`, GitHub Actions https://github.com/Os-WHGo/Wivra/actions/runs/41151818001 (10/20/30/60 min del motor actual, no del acelerado).

## Primer bloque técnico REAL, sin anunciar disponibilidad falsa

- Código ejecutable compartido: `app/accelerated-cut-renderer.mjs`, que contiene una extracción de Claude `tools/export-engine-benchmark.cjs` **para cortes A/V de una única fuente**. Mediabunny `Input/CanvasSink/AudioBufferSink`, CanvasSource, AudioBufferSource, Output StreamTarget sobre `WritableStream`, WebCodecs; el benchmark ahora llama el mismo módulo en lugar de duplicar el algoritmo.
- `acceleratedCutEligibility` niega montajes con capas, pistas independientes, audio alterado, efectos, velocidad, transición, texto, formato distinto del original, huecos y varios archivos fuente. Estos casos necesitan portar el renderer completo de Wivra. Solo se soporta un subconjunto de cortes y no hay UI de aceleración todavía.
- `checkedRandomWrite` exige callback explícito de escritura por posición arbitraria, validación de límites y confirmación exacta de bytes. **La vía MediaRecorder existente usa el protocolo nativo v1 append+CRC, NO tiene writeAt**. Pasar directamente el StreamTarget de Mediabunny a ese sink corrompería los encabezados MP4; se prohíbe tal integración. Nada del almacenamiento v1 se modifica.
- Las pruebas de contrato comprueban tiempos de fotograma A/V, parches de offsets, duraciones, rechazo de cambios semánticos y audio ausente. El banco aislado puede utilizar la ruta compartida con Mediabunny cuando el paquete de pruebas ya está presente. No hay descarga de librería en tiempo de ejecución.
- `app/export-engine-policy.mjs` mantiene por ahora `ACCELERATED_EXPORT_IMPLEMENTED=false`; no se autoriza activar «Auto inteligente» hasta integrar y probar el formato completo (por lo menos capas, audio independiente, subtítulos, transiciones, efectos, fotos/GIF), empaquetar Mediabunny offline, implementar nuevo sink nativo por posición en iOS/Android con comprobación de integridad y QA móvil.
- Si el navegador no ofrece WebCodecs, si falta el codec compatible o el render no pasa comprobación, la exportación MediaRecorder/progresiva del usuario se conserva. La compatibilidad de H.264/AAC vs VP9/Opus debe probarse por dispositivo; `video/mp4` con Opus fue una combinación inadecuada en el emulador Android según Claude.

## Alternativas investigadas y licencias

- **Mediabunny 1.61.6**: MPL-2.0, https://github.com/Vanilagy/mediabunny/tree/v1.61.6 y https://www.npmjs.com/package/mediabunny/v/1.61.6. Se favorece por API `CanvasSink/CanvasSource/AudioBufferSink/StreamTarget` reutilizada en benchmark Claude. MPL-2.0 exige conservar avisos y obligaciones de distribución sobre código licenciado/modificado antes de publicar.
- **Mediabunny 1.65.0**: versión más reciente que existe al 01-11-2026, no se actualiza automáticamente por riesgo de regresiones API y porque el benchmark válido fue 1.61.6. Evaluar lockfile, tamaño y rendimiento antes de actualización.
- **MediaRecorder + reparación WebM/MP4**: se mantiene como ruta de producción local, verificada en emulador; exportaciones 10/20/30/60 min Linux Chromium en verde; coste/privacidad conocido, pero la renderización va en tiempo real.
- **WebCodecs directo + muxer manual**: implementaría ISO BMFF/WebM, codecs y backpressure por cuenta propia; duplicación innecesaria de Mediabunny.
- **WebRTC/LiveKit/HaishinKit/RootEncoder**: orientados a emisión en vivo, no sustitutos de un renderer offline con timeline multipista.
- No incluir CDN obligatoria, claves, coste, servidor o extracción de video externo. Mantener original y acceso a exportador antiguo. Ni Apple Developer, ni publicación, ni merge main.

## Próximos macrobloques de activación condicionada

1. Prototipo nativo aleatorio **v2 separado** por host con begin→writeAt→finish/abort; no tocar contrato v1 hasta benchmark con parches MP4 y CRC leído del archivo final.
2. Bundle OFFLINE de Mediabunny 1.61.6 con SRI/hash de artefacto, cumplimiento MPL-2.0, medición del peso final de editor y comprobación de licencias.
3. Portar al motor rápido toda la lógica de `drawFrame`, volúmenes/cortes, filtros, overlays, texto, subtítulos, audio independiente y transiciones o bloquear explícitamente no soportado. Comparar clips heterogéneos con exportador anterior; drift A/V, duración, máxima RSS, 120/600/1800/3600 s.
4. Al pasar CI real en Chromium, WebView Android, WKWebView iOS y QA hardware, habilitar selección automática inteligente y fallback seguro sólo antes de comenzar a escribir (sin archivos parciales reutilizados).

**Este documento registra avance técnico, no proclama la función completa disponible.**


## Segundo macrobloque: exportación experimental REAL desde recordProject (sin activar beta)

- `app/accelerated-memory-export.mjs`: escritor temporal **solo en memoria** y con límite de 96 MiB, escrituras `writeAt` verificadas por rango y comprobación de cobertura completa sin huecos. Cada modificación de cabecera sobrescribe bytes ya escritos; si quedan zonas no escritas, aborta sin producir Blob. Es la ruta de QA corta, no alternativa a disco nativo para videos largos.
- `app/export.mjs recordProject` admite un parámetro exclusivo **`experimentalAccelerated: true`** para pruebas controladas, con `saveMode:'memory'`; llama al motor común WebCodecs+Mediabunny. El editor normal NO establece este parámetro y no activa esta ruta con `exportEngine:'auto'`. La respuesta marca explícitamente `experimental: true` y `verifiedOnDevice:false`, no verificación ni publicación.
- `app/build.mjs` empaqueta la lógica experimental en un solo HTML sin conexión. Para la prueba aislada se incluye el CJS local de Mediabunny 1.61.6 mediante `WIVRA_MEDIABUNNY_BUNDLE`; el script confirma nombre, versión exacta y licencia MPL-2.0. GitHub Actions ejecuta prueba de HTML/navegador y restaura después el HTML normal sin SDK. Nunca se utiliza CDN en runtime.
- `app/tests/accelerated-memory-export.test.mjs` ejecuta el verdadero API `recordProject` con un SDK simulado, incluye verificación de parche de bytes, detección de huecos y denegación de montajes incompatibles. Esto prueba integración del código, NO la reproducción real en Safari/Android ni los efectos multipista.
- `acceleratedCutEligibility` usa lista permitida de propiedades de clip: cualquier atributo visual desconocido hace fallar la vía rápida y evita perder filtros o efectos en futuras versiones del editor. El código rápido aún no es motor de producción aunque ya haya un API de QA.
- El adaptador nativo v2 `app/accelerated-native-sink.mjs` valida capacidades, offset, bytes, hash SHA-256 e información de pistas después de las correcciones MP4. Sin implementaciones de host Android/iOS sigue deshabilitado.
