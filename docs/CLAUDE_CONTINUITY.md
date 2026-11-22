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

### Sesión 2 (2026-11-22, continuación)

| Commit | Qué | Estado |
| --- | --- | --- |
| `e479a35` | Filas de audio (`track` 1–4) ya no excluyen el proyecto del motor rápido; PCM idéntico. | IMPLEMENTADO + TEST |
| `b957849` | **Bug del motor clásico**: un GIF animado en la línea principal se exportaba congelado en su primer fotograma. Corregido; `tools/browser-gif-main-export.cjs` lo verifica (falla antes, pasa después). | IMPLEMENTADO + TEST NAVEGADOR |
| `536e92e` | GIF animados en el motor rápido (principal y capa), con los fotogramas ya decodificados por el editor. `tools/browser-accelerated-gif.cjs`. | IMPLEMENTADO + TEST NAVEGADOR (H.264 MP4) |
| `db0c3cb` | "Volumen del video" (parejo fuerte/suave) con la misma ganancia medida en ambos motores; +6 dB medido +6,00 dB. | IMPLEMENTADO + TEST NAVEGADOR |
| `30e653e` | Motivos de fallo del motor rápido explicados en español, con detalle técnico. | IMPLEMENTADO + TEST |

Sondeo de paridad: todas las operaciones del editor, las 10 plantillas, montaje rápido, fundidos cruzados y transiciones pasan el preflight acelerado. Rechazos que quedan a propósito: guardado en memoria y exportar con medios incompletos (se ofrece MediaRecorder).

## 5. Pruebas (resultado local, este contenedor Linux, sin hardware)

| Suite | Comando | Resultado |
| --- | --- | --- |
| Offline acelerado + LIVE + build | `node tools/wivra-accelerated-offline-check.cjs --full --live --build` | 241/241 (sesión 2) · streaming 574 PASS + 10 TODO · build OK |
| App completa | `node --test app/tests/*.test.mjs` | 788/788 (sesión 2) |
| Core | `node --test core/tests/*.test.mjs core/*.test.mjs` | 121/121 |
| Tools | `node --test tools/*.test.cjs` | 38/38 |
| Android JVM (Kotlin 2.2.20, API 36) | `gradle -p tools/android-jvm-check test` | 107/107 en 29 clases |
| Navegador (Chromium, Playwright 1.63.0, Mediabunny 1.61.6, ffmpeg 6.1.1) | `WIVRA_MEDIA_LAB=<lab> node tools/browser-*.cjs` | PASS: probe, roundtrip, real editor, progressive, container playback, multitrack (default/shared-source/gap/duck/stress/long/hd-canary), main still, composition parity, codec diagnostic, crossfade, long multipart (1 reintento permitido por CI). **FALLO**: `composition-parity --spatial`, un punto del inset 2 niveles fuera de tolerancia (azul 72 vs 86 ±12); la CI fija Playwright 1.56.1 — sin confirmar si es dependiente de versión. |
| Editor en Chromium | carga de `app/dist/agentcut.html` | 0 errores de página |
| Soak acelerado 10 min (Linux QA) | `WIVRA_LONG_QA_MINUTES=10 node tools/browser-multitrack-accelerated.cjs` | PASS · 600,02 s VP9/Opus WebM, 18 000 fotogramas, 120 cortes + 30 voces + música, render 132,6 s (≈4,5× tiempo real), RSS pico 885 MiB (presupuesto 4096), voz y escena final presentes, Cues + duración. No es H.264/AAC ni teléfono. |

Laboratorio local: tarball `mediabunny-1.61.6.tgz` verificado con el mismo SRI SHA-512 que la CI; Playwright/Chromium preinstalados del contenedor.

## 6. Herramientas nativas (desde 2026-11-22, sesión 3)

Con red a `dl.google.com` y `download.swift.org`, `tools/setup-native-toolchain.sh` instala fuera del repo (en `$HOME/wivra-toolchain`) el SDK Android 36 + build-tools 35, JDK 17, Swift 6.2.1 (firma PGP verificada) y Playwright 1.56.1 + Mediabunny 1.61.6 (SRI). Después: `source $HOME/wivra-toolchain/env.sh`.

| Comprobación | Resultado |
| --- | --- |
| Android `compile{Full,Capture}Debug{Kotlin,JavaWithJavac}` (como CI, JDK 17) | BUILD SUCCESSFUL, 0 APK |
| Android `test{Full,Capture}DebugUnitTest` | 107/107 y 85/85 |
| Android `compile*DebugAndroidTest*` | BUILD SUCCESSFUL |
| Swift Linux: diario de intención iOS (nuevo), DAT profiles, Ray-Ban sync, multicam | PASS (20/20 en el diario) |
| Navegador fijado de CI (Chromium 141): `composition-parity --spatial` y 14 herramientas más | PASS; el fallo espacial anterior era solo de Chromium 157 |

Sigue sin poder hacerse aquí: compilar el código Swift que usa AVFoundation/WebKit (store y puente iOS completos) — requiere macOS; el smoke nuevo está en `meta-b0-native-build.yml`. Sin APK/IPA, emulador ni hardware por política. Hallazgo pendiente (no en CI): `browser-i18n-audit` señala 10 textos sin traducir del panel QA de diagnóstico de códecs (W66).

## 7. Siguiente macrobloque exacto

1. Ejecutar en macOS (CI `meta-b0-native-build.yml` o un Mac) la compilación iOS completa con el diario nativo (`db90623`) y sus smokes; corregir si Xcode marca algo en `WivraAcceleratedExportStore.swift`/puente.
2. Traducir los 10 textos del panel QA de diagnóstico de códecs (coordinar con ChatGPT/Codex, área W66).
3. Hito físico autorizado: matar la app durante `finishRandom` y borrar datos del WebView (Android e iPhone) y comprobar que el diario nativo obliga a revisar; GIF como clip principal y sticker y "Volumen parejo" en ambos motores; H.264/AAC 10/30/60 min; LIVE RTMP/RTMPS + MP4; Ray-Ban; micrófonos.
4. Mantener: `main` sin fusionar, `ACCELERATED_EXPORT_IMPLEMENTED=false`, MediaRecorder como alternativa, Wivra Capture separable, sin Actions de pago ni instalables.
