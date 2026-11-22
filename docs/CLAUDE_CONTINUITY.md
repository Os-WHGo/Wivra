# Wivra · continuidad técnica de Claude

> Archivo de continuidad de software (público). Complementa, **no sustituye**, el checkpoint canónico privado del propietario.
> Al iniciar una sesión: leer este archivo, comprobar en GitHub el HEAD real de las ramas de abajo y reconciliar antes de cambiar código. Si este archivo y GitHub difieren, manda GitHub.
> Cada resultado se marca **IMPLEMENTADO**, **TEST AUTOMÁTICO**, **COMPILADO**, **HARDWARE** o **PROPUESTO**. Nada de lo de abajo se probó en un teléfono físico. — Claude

## 1. Ramas y SHA (actualizado 2026-11-22)

| Rama | Papel | HEAD |
| --- | --- | --- |
| `main` | Base fusionada (PR #163). No tocar sin autorización. | `9973281` |
| `chatgpt/wivra-w110-live-accelerated-candidate-20261110` | Candidata integrada (W110–W111-B, incluye Codex LIVE `7d2eed9`). Base de esta rama. | `079238c` |
| `claude/wivra-separation-autonomy-1eyzht` | **Rama activa de Claude.** Parte de `079238c`, sin PR, sin merge. | ver `git log -1` |

Todos los commits de la rama activa llevan `[skip ci]`; ningún workflow tiene trigger `push` para `claude/**`. No se abrió PR.

## 2. Workspace local independiente

- Clon propio en `/home/user/wivra` (repo Git independiente, remoto `Os-WHGo/Wivra`), separado de cualquier otro proyecto del contenedor.
- Laboratorio de medios local fuera del repo, apuntado con `WIVRA_MEDIA_LAB` (ver §5). No se instala nada dentro del repo.
- No se creó ningún segundo repositorio en GitHub.

## 3. Arquitectura vigente (resumen verificado en el código)

- **Editor único** HTML+JS: fuentes en `core/` y `app/`; `node app/build.mjs` genera `app/dist/agentcut.html` (determinista). Android (`streaming/android/app/build.gradle`) e iOS (`streaming/ios/B0/project.yml`) **empaquetan ese archivo tal cual**.
- **Director, timeline multipista, subtítulos, teleprompter, plantillas**: `core/*.mjs`, `app/*.mjs`.
- **Exportación**: MediaRecorder es el motor por defecto y alternativa segura. WebCodecs + Mediabunny 1.61.6 (vendorizado, SHA-256 fijado, embebido comprimido e inerte) es el motor objetivo, **solo QA/beta manual**: `ACCELERATED_EXPORT_IMPLEMENTED=false` en `app/export-engine-policy.mjs`.
- **Escritura nativa v2** (aleatoria, por token): Android `WivraAcceleratedExportBridge` + `WivraRandomExportStore`; iOS `WivraAcceleratedExportNativeBridge.swift`. Catálogo de recuperación `listRecovered`/`restoreRecovered`.
- **Captura/LIVE** (área de ChatGPT/Codex): `streaming/` — Android flavors `full` y `capture` (Wivra Capture separable), iOS B0, RTMP/RTMPS, escenas, Ray-Ban Meta DAT.

## 4. Trabajo de esta sesión (2026-11-22)

| Commit | Qué | Estado |
| --- | --- | --- |
| `5933437` | Dos mocks de tests (`accelerated-main-photo-render`, `accelerated-camera-mic-mix`) no emitían `onEncoderConfig`; la puerta nativa de `8be8be9` es correcta. Offline check pasaba 222/224 en checkout real. | TEST AUTOMÁTICO |
| `b8d9f04` | `app/dist/agentcut.html` estaba **29 commits de fuentes atrasado** (desde `d1fdfc7`): un build nativo local habría empaquetado un editor sin las puertas W110. Regenerado (build determinista). | IMPLEMENTADO |
| `518bb7e` | `tools/android-jvm-check`: compila el Kotlin/Java real con Kotlin 2.2.20 contra la API Android 16 (`org.robolectric:android-all` de Maven Central) y ejecuta JUnit, sin Android SDK. | COMPILADO + TEST |
| `a508191` | Test `dist-bundle-matches-source`: falla si el bundle commiteado difiere de un build fresco (`WIVRA_BUILD_OUT`). Incluido en el offline check. | TEST AUTOMÁTICO |
| `4f1889e` | **Diario nativo de intención** de exportación acelerada (Android): `WivraExportIntentJournal`, armado antes de crear la sesión, cerrado solo tras publicación verificada o abort; `helloRandom` anuncia `exportIntentJournal`/`interruptedExport`; op `ackInterruptedExport`. La UI QA exige revisión para ambos motores si el diario nativo indica interrupción aunque se pierda `localStorage`. | IMPLEMENTADO + TEST (no APK, no dispositivo) |
| `3b98aa8` | `tools/media-lab.cjs`: 24 herramientas de navegador ya no dependen de la ruta fija de CI (`WIVRA_MEDIA_LAB`). `.gitignore` raíz para informes JSON. | IMPLEMENTADO |

## 5. Pruebas (resultado local, este contenedor Linux, sin hardware)

| Suite | Comando | Resultado |
| --- | --- | --- |
| Offline acelerado + LIVE + build | `node tools/wivra-accelerated-offline-check.cjs --full --live --build` | 232/232 · streaming 574 PASS + 10 TODO · build OK |
| App completa | `node --test app/tests/*.test.mjs` | 778/778 |
| Core | `node --test core/tests/*.test.mjs core/*.test.mjs` | 121/121 |
| Tools | `node --test tools/*.test.cjs` | 38/38 |
| Android JVM (Kotlin 2.2.20, API 36) | `gradle -p tools/android-jvm-check test` | 107/107 en 29 clases |
| Navegador (Chromium, Playwright 1.63.0, Mediabunny 1.61.6, ffmpeg 6.1.1) | `WIVRA_MEDIA_LAB=<lab> node tools/browser-*.cjs` | PASS: probe, roundtrip, real editor, progressive, container playback, multitrack (default/shared-source/gap/duck/stress/long/hd-canary), main still, composition parity, codec diagnostic, crossfade, long multipart (1 reintento permitido por CI). **FALLO**: `composition-parity --spatial`, un punto del inset 2 niveles fuera de tolerancia (azul 72 vs 86 ±12); la CI fija Playwright 1.56.1 — sin confirmar si es dependiente de versión. |
| Editor en Chromium | carga de `app/dist/agentcut.html` | 0 errores de página |
| Soak acelerado 10 min (Linux QA) | `WIVRA_LONG_QA_MINUTES=10 node tools/browser-multitrack-accelerated.cjs` | PASS · 600,02 s VP9/Opus WebM, 18 000 fotogramas, 120 cortes + 30 voces + música, render 132,6 s (≈4,5× tiempo real), RSS pico 885 MiB (presupuesto 4096), voz y escena final presentes, Cues + duración. No es H.264/AAC ni teléfono. |

Laboratorio local: tarball `mediabunny-1.61.6.tgz` verificado con el mismo SRI SHA-512 que la CI; Playwright/Chromium preinstalados del contenedor.

## 6. Bloqueos reales de este entorno

- **Android APK / AGP / androidx / instrumentados**: `dl.google.com` bloqueado (Maven de Google redirige allí). Por eso existe `tools/android-jvm-check`. `WivraAcceleratedExportBridge.kt` (usa `androidx.webkit`) **no se compiló**; su cambio es mínimo y revisado a mano.
- **iOS/Swift**: sin toolchain (download.swift.org bloqueado, sin macOS/Xcode). El diario de intención **no existe aún en iOS** (el editor lo trata como `unsupported` y sigue usando el marcador local).
- **H.264 + AAC MP4**: Chromium Linux codifica `avc1.42001E` pero no `mp4a.40.2`. La exportación acelerada H.264/AAC solo se puede validar en dispositivo.
- **Hardware**: Ray-Ban Meta, RTMP/RTMPS real, micrófonos externos, 10/30/60 min en teléfono, almacenamiento/temperatura: pendiente de hito físico autorizado.

## 7. Siguiente macrobloque exacto

1. **iOS paridad del diario de intención** (espejo de `WivraExportIntentJournal.kt`): nuevo `streaming/ios/B0/Sources/WivraExportIntentJournal.swift`; en `WivraAcceleratedExportStore.swift` armar en `begin` (antes de crear la sesión), cerrar tras publicación verificada en `finish` y en `abort`, y exponer `interruptedExport`/`acknowledgeInterruptedExport`; en `WivraAcceleratedExportNativeBridge.swift` añadir `exportIntentJournal`/`interruptedExport` a `helloRandom` y el caso `ackInterruptedExport`. Smoke nuevo `streaming/tests/WivraExportIntentJournalSmoke.swift` y entrada en `meta-b0-native-build.yml`. Requiere macOS/Xcode o un toolchain Swift (6.x en Linux sirve para el smoke). La UI del editor ya lo consume sin cambios.
2. Ejecutar `composition-parity --spatial` con Playwright 1.56.1 (versión de CI) para decidir si el punto del inset es dependiente de versión o regresión; no relajar la tolerancia sin esa evidencia.
3. Con acceso a `dl.google.com` o máquina con SDK: `gradle -p streaming/android :app:assembleFullDebug :app:assembleCaptureDebug :app:assembleFullDebugAndroidTest` (compile-only, sin publicar APK) y androidTest de recuperación.
4. Hito físico autorizado: matar la app durante `finishRandom`, borrar datos del WebView y comprobar que el diario nativo obliga a revisar; H.264/AAC 10/30/60 min; LIVE RTMP/RTMPS + MP4 simultáneo; Ray-Ban; micrófonos.
5. Mantener: `main` sin fusionar, `ACCELERATED_EXPORT_IMPLEMENTED=false`, MediaRecorder como alternativa, Wivra Capture separable, sin Actions de pago ni instalables.
