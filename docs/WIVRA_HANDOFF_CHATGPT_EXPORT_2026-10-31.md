# Traspaso a ChatGPT · Exportación audiovisual (Claude, 31-10-2026)

Para: ChatGPT (integración de #131 y #133). Autor: Claude. Rama: `claude/wivra-progressive-export-20261030` · PR borrador #132. No se fusionó nada a `main` ni a la rama compartida de #131.

## 1. Cómo integrar (sin conflictos)

- Tu rama `chatgpt/wivra-beta-integration-20261030` (`3b49f1e`) **ya está fusionada dentro de la mía** (merge `076d788`); tus correcciones se conservan. Por eso **integrar mi rama en la tuya es un avance rápido**, sin conflictos:
  `git fetch origin claude/wivra-progressive-export-20261030 && git merge --ff-only FETCH_HEAD`
- Al fusionar resolví dos conflictos, que eran la misma corrección escrita de dos formas (`diskBytes`/`diskCrc` y el lector `u32` de Swift 6). Me quedé con mi versión; las dos compilaban en el CI.
- Si `app/dist/agentcut.html` entra en conflicto con commits nuevos tuyos, no lo resuelvas a mano: ejecuta `node app/build.mjs`.

## 2. Qué hay en mi rama después de `7d4c31b` (lo que integraste en #133)

| Commit | Cambio | Por qué |
|---|---|---|
| `ace8df0`, `efe3d1c` | Swift 6: alcance de `diskBytes` y bytes divididos para que termine la comprobación de tipos | Errores reales del CI (equivalentes a tus `31dedb4`/`a2a3d5f`) |
| `2bf8016` | `tools/long-export-soak.cjs` + workflow `wivra-long-export-soak.yml` (10/20/30/60 min), `tools/export-engine-benchmark.cjs` (MediaRecorder frente a WebCodecs+Mediabunny), `tools/browser-container-playback.cjs` | Macrobloques B y C |
| `f24e016` | Puente Android: cabecera y datos en una sola asignación desde el Blob; pruebas de confirmaciones duplicadas, perdidas o desordenadas; interrupción por cambio de app; rendimiento del puente en el emulador | Optimización y recuperación |
| `19162c7` | **Pausa de MediaRecorder + suspensión del AudioContext durante la carga, la búsqueda y el arranque de `play()` de cada corte** | Deriva ~34 ms por corte; 2 min: 0,755 % → 0,222 % |
| `237af75` | **MP4 fragmentado: duración solo en `mehd`** (JS); Swift solo añade `mfra` y deja la duración al passthrough | ISO/IEC 14496-12. Escribir la duración también en `mvhd` hacía que AVFoundation leyera 4.046 ms en vez de 2.023. Se combina con tu `3b49f1e` (passthrough del original primero) |
| `23c00fe` | iOS: limpieza de `.remux.mp4` huérfanos al arrancar | Copia interrumpida |
| `5ffaaa5` | **Re-anclaje del audio independiente en cada corte**, solo mientras el grabador está en pausa | Voces y música grabadas aparte se desalineaban del video (hasta 695 ms frente a lo planificado en 10 min); ahora media 65 ms y máximo 97 ms, sin acumularse |
| `441b3a5`, `0e7884e` | Documentación | — |

## 3. Cosas que NO se deben revertir al integrar

1. `MainActivity.java`: `settings.setMediaPlaybackRequiresUserGesture(false)`. **Sin esa línea Android no exporta**. Medido en el emulador: con el valor por defecto, el editor real falla con «El navegador no dejó reproducir un video para exportar». En iOS, el equivalente en `WivraEmbeddedEditorScreen.swift` (`allowsInlineMediaPlayback`, `mediaTypesRequiringUserActionForPlayback = []`), sin medir en iPhone.
2. `WivraExportNativeBridge.swift`: `excludedActivityTypes = [.saveToCameraRoll]` mientras no exista `NSPhotoLibraryAddUsageDescription` (sin esa clave, iOS cierra la app al tocar «Guardar video»).
3. `pickMime(…, { platform })`: H.264+AAC primero; en iOS nunca WebM antes que MP4; fuera de iOS, WebM antes que H.264+Opus en MP4 (Opus en MP4: MediaMuxer lo rechaza y Android le leía 22 ms).
4. Duración del MP4 fragmentado **solo en `mehd`**, nunca en `mvhd`/`tkhd`/`mdhd`.

## 4. Evidencia de CI

- `237af75`: **13/13 en verde** (compilación iOS/Android, prueba de humo macOS con MP4 reales: AAC → 2.023 ms y Opus → 2.220 ms, ambos `mp4-passthrough`; emulador 16/16; matriz de navegadores).
- `5ffaaa5`: **13/13 en verde**.
- Emulador (Android 15, WebView Chrome 124): solo graba WebM; WebM real 0 ms → 2.237 ms tras la reparación; puente **18,3 MB/s**; exportación real del editor 3,2 s → 3,45 s, reparada.
- Exportaciones largas con la pausa durante las búsquedas (`19162c7`, Chromium Linux): 10/20/30 min con deriva ~0,14 % (0,87 / 1,70 / 2,52 s), A/V del clip ≤ 80 ms y RSS de Chromium estable en ~1,28 GB (sin fuga). Ronda `5ffaaa5` (con el re-anclaje y la métrica frente al video): en curso.
- Motores (Chromium, 60 s y 20 cortes): WebCodecs+Mediabunny **8,5×** tiempo real frente a 0,99× de MediaRecorder; A/V 8 ms frente a 60 ms. **No integrado**: +694 KB en el HTML, `StreamTarget` escribe por posición (el puente necesitaría `writeAt`) y hay que portar el render. Decide el propietario.

## 5. Pendiente y pruebas físicas (no afirmar)

- Teléfonos reales: exportar 1, 10 y 30 min en Android e iPhone; abrir en Galería/Archivos; comprobar duración, saltos, audio y temperatura. Pasos en §6 de `docs/WIVRA_EXPORT_ENGINE_MEGABLOCK_2026-10-30.md`.
- iPhone: verificar que la reproducción programática y el remux funcionan en un dispositivo (en macOS sí).
- Decisiones del propietario: añadir `NSPhotoLibraryAddUsageDescription` para guardar directo en Fotos, integrar WebCodecs y subir la tasa de bits en exportaciones largas.
- Pistas de audio independientes muy largas: se decodifican enteras en memoria (comportamiento previo).

Informes completos: `docs/WIVRA_EXPORT_ENGINE_MEGABLOCK_2026-10-30.md` y `docs/WIVRA_PROGRESSIVE_EXPORT_2026-10-30.md`. Biblioteca MU y checkpoint de Wivra en Drive actualizados el 31-10-2026.

— Claude
