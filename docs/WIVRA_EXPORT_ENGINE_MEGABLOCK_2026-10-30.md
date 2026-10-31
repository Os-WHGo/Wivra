# Wivra · Megabloque de exportación: contenedores, motores, pruebas largas y fiabilidad (30-10-2026)

Autor: Claude. Rama `claude/wivra-progressive-export-20261030`, PR borrador #132, que apunta a la rama de #131. No se fusiona a `main`, no se pagó ningún servicio y no se añadieron permisos de privacidad. Este documento continúa `docs/WIVRA_PROGRESSIVE_EXPORT_2026-10-30.md`.

Leyenda: **[V]** verificado con prueba o fuente (se indica dónde) · **[NV]** no verificado · **EMU** emulador Android · **CI** GitHub Actions · **LOCAL** contenedor Linux de esta sesión.

## 1. Lo más importante, en corto

1. **La exportación en Android no funcionaba.** **[V EMU]** Con la configuración por defecto del WebView, el editor real falla con «El navegador no dejó reproducir un video para exportar»: el `<video>` oculto se reproduce después de varias esperas, cuando ya no hay un toque del usuario en curso, y el WebView lo bloquea. Se corrigió con `setMediaPlaybackRequiresUserGesture(false)` (solo afecta al editor local y sin conexión), y la misma prueba ya exporta bien. En iOS se aplicó el equivalente (`mediaTypesRequiringUserActionForPlayback = []`, `allowsInlineMediaPlayback = true`) **[NV en iPhone]**.
2. **Los videos salían sin duración y sin poder avanzar ni retroceder.** **[V]** El WebM de MediaRecorder no trae duración ni índice: Android leía **0 ms** y Chromium mostraba `Infinity`. El MP4 fragmentado declara duración 0 y tampoco tiene índice. Ahora se reparan **sin recodificar**: los bloques de audio y video se copian byte a byte y solo se reescriben las cabeceras. Después de la reparación, Android lee **2.237 ms** y Chromium muestra 2,237 s con zona de salto completa.
3. **El WebView de Android solo graba WebM.** **[V EMU, Chrome 124]** No admite ninguna variante MP4 en MediaRecorder. Por eso, en Android, lo que hay que reparar bien es el WebM.
4. **WebCodecs + Mediabunny es muy superior en velocidad y sincronía** **[V LOCAL, Chromium Linux, no teléfono]**: 8,5× más rápido que el tiempo real, frente a 0,99× de MediaRecorder, con un desfase audio/video medio de 8 ms frente a 60 ms. **No se integró** en el editor: añade unos 694 KB al HTML único y cambia el motor de render, así que lo decide el propietario (ver §4).
5. **iOS:** «Guardar video» en la hoja de compartir cerraba la app al tocarlo, porque falta el permiso `NSPhotoLibraryAddUsageDescription`. **[V documentación de Apple / patrón conocido; NV en iPhone]** Se ocultó esa opción; siguen disponibles «Guardar en Archivos» y las demás apps. Añadir el permiso lo decide el propietario.

## 2. Funciones implementadas (macrobloques A, D, E y F)

| Función | Archivos | Estado |
|---|---|---|
| Reparación WebM: Duration, Cues, SeekHead y tamaños conocidos; bloques intactos | `app/media-container.mjs` (JS) · `WivraWebmSeekable.kt` (Kotlin en flujo, **idéntico byte a byte** al JS) | IMPLEMENTADO · PROBADO (JVM, EMU, Chromium) |
| Reparación MP4 fragmentado: duración real **solo en `mehd`** (como pide ISO/IEC 14496-12) + índice `mfra`, sin mover muestras | `media-container.mjs` · `WivraMp4Repair.swift` (solo `mfra` en el sitio; la duración la escribe el remux de AVFoundation) | IMPLEMENTADO · PROBADO (JS + ffprobe; Swift en macOS CI) |
| MP4 fragmentado → MP4 normal (`moov` completo) | Android `WivraExportFinalizer.remuxMp4` (MediaExtractor→MediaMuxer) · iOS AVFoundation passthrough | IMPLEMENTADO · Android PROBADO EMU con H.264+AAC; con H.264+Opus MediaMuxer lo rechaza y se conserva el original |
| Verificación del archivo final: pista de video, audio esperado, duración planificada frente a medida, si declara duración y tiene índice | `verifyExportedMedia` (JS) · `WivraExportFinalizer.inspect` (MediaMetadataRetriever) · `WivraMp4Repair.inspect` (AVFoundation) | IMPLEMENTADO · los avisos se muestran en el diálogo de exportación |
| Publicación segura: la copia reparada solo sustituye a la grabación verificada si la copia también se verifica; si no, se entrega el original con el motivo | `WivraExportStore.finish/repairCopy` · `WivraExportStore.swift finish` | IMPLEMENTADO · PROBADO EMU |
| Elección de formato por plataforma: H.264+AAC primero; en iOS nunca WebM antes que MP4; fuera de iOS, WebM antes que H.264+Opus en MP4 | `pickMime(…, { platform })` | IMPLEMENTADO · PROBADO (unidad) |
| Reproducción programática de los clips propios durante la exportación | `MainActivity.java`, `WivraEmbeddedEditorScreen.swift` | Android PROBADO EMU · iOS NV |
| Hoja de compartir iOS sin «Guardar video» mientras no exista el permiso | `WivraExportNativeBridge.swift` | IMPLEMENTADO · NV en iPhone |
| Puente Android: cabecera y fragmento en una sola asignación (antes, dos copias por fragmento) | `export-sink.mjs readChunk` | IMPLEMENTADO · PROBADO (Chromium e2e, unidad) |
| Limpieza: `_rec` y copias pendientes de Android, `.partial` y `.remux.mp4` de iOS | `cleanupOrphans` en ambos | IMPLEMENTADO · PROBADO (EMU, macOS) |

## 3. Pruebas reales y mediciones

### 3.1 Android, emulador API 35 (Android 15, WebView Chrome 124), [run 41145372038](https://github.com/Os-WHGo/Wivra/actions/runs/41145372038/job/124370214202), 15/15 OK

| Medición | Resultado |
|---|---|
| `MediaRecorder.isTypeSupported` | WebM VP8/VP9 + Opus: sí · todas las variantes MP4: **no** |
| Exportación real del editor con la configuración de WebView por defecto | **Falla**: «El navegador no dejó reproducir un video para exportar» |
| Exportación real con `setMediaPlaybackRequiresUserGesture(false)` | OK · 3,2 s planificados → **3,453 s** en el archivo · 3,9 s de reloj · 4 fragmentos · cola máxima 73.673 B · `webm-cues` · audio y video presentes |
| WebM real de Chromium, sin reparar → reparado (MediaMetadataRetriever) | **0 ms**, sin índice → **2.237 ms**, con Duration y Cues |
| MP4 fragmentado H.264+AAC | `mp4-remux` → MP4 normal de 2.043 ms con audio y video |
| MP4 fragmentado H.264+Opus | MediaMuxer: «Failed to add the track» → se entrega el original sin cambios (el CRC coincide); Android le lee **22 ms** (un motivo más para no usar Opus en MP4) |

### 3.2 Contenedores en reproductores reales [V LOCAL, Playwright Chromium 153]

| Archivo | Original | Reparado |
|---|---|---|
| WebM VP8/Opus de MediaRecorder | `duration = Infinity`, la zona de salto termina en Infinity | **2,237 s**, salto a 1,5 s correcto |
| MP4 H.264/Opus fragmentado | 2,214 s (Chromium lo recorre entero) | 2,214 s, cabecera e índice correctos |

En el CI la misma prueba corre también con WebKit de Linux (`tools/browser-container-playback.cjs`). WebKit de Linux no es Safari de iPhone.

### 3.3 Motores: MediaRecorder frente a WebCodecs + Mediabunny 1.61.6 [V LOCAL, Chromium Linux, códecs por software]

`tools/export-engine-benchmark.cjs 60 20`: montaje de 60 s con 20 cortes, texto y audio. La fuente lleva un destello y un pitido cada 2 s para medir la sincronía.

| | MediaRecorder (motor actual) | WebCodecs + Mediabunny (prototipo aislado) |
|---|---|---|
| Velocidad | 0,99× tiempo real (60,7 s) | **8,5×** (7,1 s) |
| Duración exportada frente a planificada | +0,367 s | **+0,02 s** |
| Desfase A/V (media / máximo, 40 marcas) | 60 / 93 ms | **8 / 8 ms** |
| RSS máximo de Chromium | ~1.006 MB | ~1.022 MB |
| Tamaño | 2,29 MB (VP8/Opus WebM) | 1,85 MB (H.264/Opus MP4) |
| Contenedor | WebM en vivo (hay que repararlo) | MP4 con `moov` (escrito por posición) |

### 3.4 Exportaciones largas: `tools/long-export-soak.cjs`

El montaje usa cortes de 3 a 8 s de dos fuentes, fundidos, un texto cada 30 s, música independiente en bucle y voz independiente. Se exporta por el camino progresivo y se mide al final.

- **[V LOCAL] 1 min:** 15 cortes, deriva +0,635 %, A/V media 57 ms y máximo 94 ms (sin empeorar entre el primer y el último cuarto), reparado con Duration y Cues, RSS de Chromium 709 → 1.076 MB.
- **[V CI] 10 min con el código anterior** (`2bf8016`): deriva +0,441 %, A/V del clip 54/74 ms, RSS 745 → 1.249 MB.
- **[V CI] 10 min con pausa durante las búsquedas** (`19162c7`): deriva **+0,145 %**, A/V del clip 52/76 ms, RSS 781 → 1.275 MB (máximo 1.290; se estabiliza, no crece sin parar), 26,6 MB, 591 fragmentos. Con la baliza se vio otro efecto: el **audio independiente** (voces y música grabadas aparte) se alejaba hasta 695 ms del tiempo planificado, porque cada corte todavía añade unos 7–9 ms al video mientras el audio independiente sigue el reloj sin pausas.
- **Corrección** (`5ffaaa5`): en cada corte, con el grabador en pausa, las fuentes independientes se vuelven a arrancar en la posición exacta del video. **[V LOCAL, 2 min]** audio independiente frente al video: media 65 ms, máximo 97 ms, **sin acumularse** (51 → 63 ms), igual al desfase constante del propio clip (~64 ms).
- **Resultados de 10/20/30/60 min con la corrección:** workflow `Wivra Long Export Soak` en `5ffaaa5` (ver el PR).

### 3.5 Recuperación y tolerancia a fallos

| Caso | Prueba | Resultado |
|---|---|---|
| Cancelación a mitad | Chromium e2e | interrumpida como «cancelada», sin archivo a medias **[V]** |
| Cambio de app o llamada (página oculta) | Chromium e2e | «interrumpida», sin archivo a medias **[V]** |
| Disco que falla en el fragmento 2 | Chromium e2e, JVM, Swift | error de guardado (nunca «cancelado»), parcial borrado **[V]** |
| Espacio insuficiente | EMU (`InsufficientStorage`), macOS (espacio libre simulado) | rechazado antes de crear ningún archivo **[V]** |
| Fragmentos duplicados, perdidos o desordenados | unidad JS (confirmaciones), JVM y Swift (`seq`) | se detiene y se borra el parcial **[V]** |
| Cierre forzado o reinicio | EMU (filas pendientes huérfanas), macOS (`.partial` y `.remux.mp4`) | limpieza al arrancar; **no hay reanudación** (no se afirma) |
| CRC y relectura desde almacenamiento | EMU y macOS | la copia reparada se verifica (bloques idénticos, CRC) antes de publicarla **[V]** |

## 4. Comparación de tecnologías (macrobloque B)

| Opción | Licencia | Plataformas | Medido aquí | Ventajas | Riesgos | Decisión |
|---|---|---|---|---|---|---|
| **MediaRecorder** (actual) + reparación de contenedor | Navegador | Android WebView (solo WebM), WKWebView (MP4) | sí (§3) | Ya integrado; render del editor completo | Tiempo real; deriva y desfase A/V mayores; pantalla siempre encendida | **Se mantiene como motor estable** |
| **WebCodecs + Mediabunny** ([repo](https://github.com/Vanilagy/mediabunny), MPL-2.0, LICENSE leído en el paquete 1.61.6) | MPL-2.0: los cambios a sus archivos deben publicarse; usarlo sin modificar es compatible | Android WebView (WebCodecs desde Chrome 94; NV en WebView), iOS completo desde 26 y parcial entre 16.4 y 18.7 ([caniuse](https://caniuse.com/webcodecs)) | sí (§3.3) | Más rápido que el tiempo real, sincronía precisa, MP4 con `moov`, H.264 cuando el sistema lo codifica | +694 KB en el HTML; habría que portar el render (capas, filtros, transiciones, velocidad, mezcla de audio); su `StreamTarget` escribe **por posición**, lo que exigiría una operación `writeAt` en el puente nativo | **Candidato principal**: integración reversible por fases (§7) |
| **Android Media3 Transformer** | Apache-2.0 | Solo Android | no | Hardware, sin WebView | Segundo motor de render en Kotlin | Referencia |
| **iOS AVFoundation (AVAssetWriter / passthrough)** | SDK de Apple | Solo iOS | passthrough sí (macOS CI) | Contenedores nativos perfectos | Segundo motor de render en Swift | Se usa **solo** para remux sin recodificar |
| FFmpegKit | LGPL/GPL | — | no | — | Retirado en enero de 2025 | Descartado |
| fix-webm-duration / ts-ebml (npm) | MIT | Navegador | no | Similar a lo hecho | Solo Duration (sin Cues) o mantenimiento bajo; lo implementado aquí añade Cues y tiene versión en Kotlin | No hace falta |

## 5. Problemas corregidos en este bloque

1. Exportación Android bloqueada por la política de reproducción del WebView (crítico; medido en EMU).
2. WebM sin duración ni índice → reparado en JS y en Kotlin; publicado solo tras verificarlo.
3. MP4 fragmentado sin duración ni índice → reparado (JS y Swift) o remuxado (Android/iOS), con respaldo.
4. iOS: «Guardar video» sin permiso de privacidad → oculto.
5. Elección de formato: H.264+Opus en MP4 ya no se prefiere fuera de iOS.
6. Puente Android: una copia de memoria menos por fragmento.
7. Errores de compilación Swift 6 detectados por el CI y corregidos.
8. **Duración doble en AVFoundation** (macOS CI): la primera versión escribía la duración en `mvhd`/`tkhd`/`mdhd` de un MP4 fragmentado y AVFoundation leía 4.046 ms en un video de 2.023 ms. Ahora la duración va solo en `mehd`, como pide la norma; ffprobe lee 2,023 s y 2,214 s y el salto funciona.
9. **Deriva por cortes** (banco largo): mientras se busca el siguiente corte, MediaRecorder seguía grabando (unos 34 ms por corte). Ahora se pausa el grabador y se suspende el AudioContext durante la carga, la búsqueda y el arranque de `play()`. Montaje de 2 min con 23 cortes: deriva de 0,755 % a **0,222 %**; audio independiente, media/máximo, de 140/647 ms a **24/121 ms**; A/V del clip, máximo, de 165 ms a 97 ms.
10. **Audio independiente desalineado en montajes largos** (medido con la baliza): se re-ancla en cada corte mientras no se graba; deja de acumularse.

## 6. Limitaciones y pruebas físicas pendientes

- **Nada probado en teléfonos físicos**, con pantalla bloqueada ni con gafas Ray-Ban. El emulador usa códecs por software.
- iOS: el remux passthrough y la inspección AVFoundation se probaron en macOS (§8), no en iPhone. Tampoco se midió en iPhone la reproducción programática ni el MediaRecorder de WKWebView.
- Con la pantalla apagada o la app en segundo plano, la exportación se detiene (MediaRecorder lo exige). Con WebCodecs podría continuar, sin verificar.
- La reparación en Android necesita temporalmente el doble del espacio del video. Si no lo hay, se entrega el original verificado con un aviso.
- Las pistas de audio independientes se decodifican enteras en memoria (comportamiento previo). Una música de 60 min ocuparía cientos de MB.
- La tasa de bits sigue bajando en videos largos (decisión pendiente del propietario).
- Temperatura y batería: no se pueden medir en el CI.

**Prueba física propuesta (unos 20 min por teléfono):** 1) instalar el APK o IPA de la ejecución; 2) importar dos videos del teléfono; 3) exportar uno de 1 min y otro de 10 min con el modo «Directo al teléfono»; 4) abrir cada resultado en Galería o Archivos y comprobar la duración y que se puede avanzar y retroceder; 5) repetir con «En memoria (anterior)»; 6) anotar el modelo, el tiempo, la temperatura percibida y si apareció algún aviso.

## 7. Integración reversible propuesta para WebCodecs (no ejecutada; decide el propietario)

1. `saveMode`/`engine: 'webcodecs'` experimental, con MediaRecorder como alternativa automática.
2. Render cuadro a cuadro reutilizando `drawFrame` (que ya acepta un canvas como fuente) con `CanvasSink` por clip; audio con `OfflineAudioContext`, que mezcla más rápido que el tiempo real.
3. Operación `writeAt(position)` en el puente nativo (Android `FileChannel.write(position)`, iOS `FileHandle.seek`), o MP4 fragmentado secuencial + la reparación ya existente.
4. Usar el mismo banco (`tools/export-engine-benchmark.cjs`) como puerta de calidad antes de activarlo por defecto.

## 8. Resultados de CI de esta entrega

| Commit | Qué valida | Resultado |
|---|---|---|
| `6b014ca` | Reparación JS/Kotlin, emulador con muestras reales y exportación real del editor | 13/13 · emulador 15/15 ([run 41145372038](https://github.com/Os-WHGo/Wivra/actions/runs/41145372038)) |
| `7d4c31b`, `ace8df0`, `efe3d1c` | Primeros intentos de la reparación iOS | `compile-ios` falló: alcance de variables y luego tiempo de comprobación de tipos de Swift 6. Corregido |
| `23c00fe` | Rendimiento del puente en el emulador | 16/16 · **18,3 MB/s** ([run 41147207594](https://github.com/Os-WHGo/Wivra/actions/runs/41147207594)) · la prueba de humo macOS detectó la duración doble de AVFoundation |
| `237af75` | Duración solo en `mehd`, prueba de humo iOS con MP4 reales, compilación iOS/Android, navegador | **13/13 en verde**. iOS (AVFoundation, macOS): H.264+AAC → `mp4-passthrough`, 2.023 ms, A+V; H.264+Opus de Chromium → `mp4-passthrough`, 2.220 ms, A+V |
| `2bf8016` | Exportación larga de 10 min (código previo a la pausa durante las búsquedas) | OK: deriva +2,647 s (+0,441 %), A/V media 54 ms y máximo 74 ms, RSS 745 → 1.249 MB, 26,6 MB, 591 fragmentos ([run 41146650807](https://github.com/Os-WHGo/Wivra/actions/runs/41146650807)) |
| `19162c7` | Exportaciones largas de 10/20/30/60 min con la pausa durante las búsquedas y la baliza de audio independiente | en curso al redactar (ver el PR) |

## 9. Riesgos de integración con el PR #131

- Cambia `MainActivity.java` (una línea de configuración del WebView) y `WivraEmbeddedEditorScreen.swift` (tres líneas de configuración). Si ChatGPT toca la misma zona habrá un conflicto pequeño y fácil de resolver.
- `app/dist/agentcut.html` se regenera: en cualquier conflicto, ejecutar `node app/build.mjs` en lugar de fusionar a mano.
- `.github/workflows/wivra-complete-beta-assembly.yml`: se añaden clases de prueba a la lista del emulador (el tiempo sube unos 30 s).
- Nuevo workflow `wivra-long-export-soak.yml`: se activa solo con cambios en sus propios archivos en esta rama, o a mano.
- La prueba de humo de iOS ahora lee muestras desde `app/tests/fixtures/mediarecorder/`, así que hay que conservar esa carpeta.
