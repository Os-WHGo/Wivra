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


## Estado de integración y evidencia W39–W42 (02-11-2026)

### W39–W41: larga duración, auditor y agregador

En PR #164, commit `03f33ac`, el workflow [41514053395](https://github.com/Os-WHGo/Wivra/actions/runs/41514053395) completó los cuatro ensayos y el agregador validó los cuatro informes:

| Timeline sintético | Render (s) | Pico RSS (MiB) | CPU de vida del proceso (%) | Muestras | Frames | Bloques de audio | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10 min | 74,40 | 861,93 | 136,5 | 23 | 18.000 | 600 | 2.108.137 |
| 20 min | 199,48 | 861,89 | 140,6 | 41 | 36.000 | 1.200 | 3.044.126 |
| 30 min | 287,45 | 878,03 | 128,1 | 61 | 54.000 | 1.800 | 3.956.348 |
| 60 min | 614,21 | 888,65 | 130,7 | 126 | 108.000 | 3.600 | 6.773.231 |

Los cuatro archivos declaran duración exacta más 20 ms, video VP9, audio Opus, índice de búsqueda y voz al final; no hubo errores ni exceso de presupuesto. El RSS es suma del árbol de procesos Chromium y puede contar páginas compartidas más de una vez. El porcentaje CPU es vida del proceso, no consumo de batería.

**Alcance estricto:** Chromium Linux, software media, 320×240 a 30 fps, 120 cortes sintéticos y 30 bloques de voz. No equivale a un teléfono, Ray-Ban ni exportación H.264/AAC.

### Canario de resolución 720p

La matriz de navegador [41514053659](https://github.com/Os-WHGo/Wivra/actions/runs/41514053659) pasó un canario de 30 s, 1280×720, 60 cortes y 15 segmentos de voz: 900 frames, 30 bloques, 30,02 s y 1.360.277 bytes. En Chromium/Linux H.264 y AAC no estuvieron disponibles. El motor eligió VP9/Opus WebM y no declaró MP4. Esto valida el fallback del navegador de QA, no H.264/AAC en WKWebView.

### W42: audio opcional y cobertura de música continua

- El checkbox «audio obligatorio» solo exige presencia cuando está marcado. Desmarcarlo no elimina audio ya escrito en las pistas. La regresión correspondiente está en `app/tests/accelerated-native-multitrack-export.test.mjs`.
- Este macrobloque añade al ensayo largo una pista de música sintética Opus continua y medición separada por bandas para voz y música al inicio, mitad y final. **La validación de esta ampliación queda pendiente del CI del commit que la introduce.**
- `ACCELERATED_EXPORT_IMPLEMENTED=false`; MediaRecorder continúa siendo el motor normal. La ruta nativa acelerada conserva el límite QA de 180 s. Los 10–60 min son exclusivamente QA Linux.

### Compilaciones y límites de entrega

- App Tests: 620/620.
- Android FULL y Capture: compilación y pruebas nativas aprobadas, sin APK.
- iOS Simulator y arm64: compilación aprobada, sin firma ni IPA.
- La matriz de navegador y el contrato de ensamblaje beta pasaron. No se generaron instalables ni se publicó nada.
- Siguen pendientes pruebas físicas agrupadas: H.264/AAC real en WKWebView iPhone, MediaStore en Android, sincronía prolongada con medios reales y cualquier afirmación sobre Ray-Ban.



## W43: integridad del bundle offline (02-11-2026)

La comprobación de nombre, versión y licencia del paquete no garantiza que el JavaScript generado sea el artefacto revisado. El build QA opcional ahora exige `WIVRA_MEDIABUNNY_SHA256`, un digest SHA-256 de 64 caracteres suministrado por el pipeline confiable, y compara el contenido exacto antes de incrustarlo. Si falta el pin o no coincide, el build se detiene; no descarga ni sustituye el bundle. Se añaden pruebas de digest correcto, ausente, malformado, incorrecto y contenido inválido.

Este control no habilita el bundle en beta: `ACCELERATED_EXPORT_IMPLEMENTED=false`, MediaRecorder sigue siendo el motor normal. El pipeline QA que use Mediabunny debe guardar y revisar el hash del artefacto antes de compilar; no debe calcular el hash y aceptarlo automáticamente desde el mismo archivo no confiable.


## W43.1: corrección del pin de Mediabunny en CI (02-11-2026)

La matriz WebCodecs falló antes de ejecutar las pruebas de navegador porque el workflow instalaba Mediabunny 1.61.6 pero no suministraba `WIVRA_MEDIABUNNY_SHA256`. No fue un fallo del render ni de WebCodecs: el build QA rechazó correctamente la ausencia del digest.

Corrección: el workflow descarga el tarball oficial de `mediabunny@1.61.6`, comprueba su SHA-512/SRI contra el valor publicado en el metadata oficial de npm (`VHEZ53/7jGl4dQ+uOdndsZufFYwEUFWv9UXgvrGun3OapyzoqI9iaPOD7z3xxY/nAttLZBNwswgJzMtGJAquOQ==`), instala ese archivo ya verificado y recién entonces calcula el SHA-256 del bundle instalado para pasarlo al build. Se conserva el fail-closed del build y no se calcula un hash para aceptar un artefacto sin autenticar.

La ejecución anterior de soak QA completó correctamente 10, 20, 30 y 60 minutos. Es Linux/Chromium sintético, no validación física iOS/Android, Ray-Ban ni RTMP.
