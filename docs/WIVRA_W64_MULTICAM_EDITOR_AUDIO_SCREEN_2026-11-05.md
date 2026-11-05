# Wivra W64 · Multicámara → editor, sonido del video en el LIVE y auditoría de pantalla (Claude, 05-11-2026)

Rama `claude/wivra-w64-multicam-editor-audio-20261105`, PR en borrador #173. Base: integración W63 de ChatGPT (#172, `c2d1ecb`, 8/8 en verde al empezar), con los historiales de ChatGPT, Codex y Claude conservados. No toca `main`.

**Nada de esto se ha probado en un teléfono físico, con gafas ni con un servidor RTMP real.**

## 1. Auditoría del estado de partida (W63)

| Área | Qué había | Qué faltaba |
|---|---|---|
| Editor | Importación de capturas `.wivra.json` verificada en Swift, en un lote y con un solo deshacer; capas superpuestas | El par de dos cámaras no entraba en el editor |
| Captura | Dos cámaras: Android en 1 MP4 compuesto, iPhone en 2 MOV con recibo `.multicam.json`; paso a una cámara; recuperación | El recibo no se conectaba con el editor |
| LIVE | 7 escenas (#171) integradas en W63 | El sonido del video (`85afa72`, `cbbc2da`) **no** estaba en W63 |
| Pantalla | LIVE de pantalla en Android (ChatGPT): consentimiento por sesión, servicio `mediaProjection`, solo imagen y sin MP4 | No se combina con la cámara ni con las escenas |
| Seguridad | Clave RTMP solo en memoria, confirmación pública, recibos de audio de una sola escritura, diario de Fotos | Sin cambios en W64 |

## 2. Macrobloque A · Par de dos cámaras del iPhone → editor (implementado)

- **Manifiesto:** `.wivra.json` v2 admite un bloque opcional `multicam` con estos campos:
  - `secondaryVideoFile`
  - `secondaryOffsetSeconds` (máximo ±10 s)
  - `corner`
  - `audio`
  - `primaryPosition` y `secondaryPosition`

  Los manifiestos anteriores no cambian (se comprueba en Swift y en JS).
- **iOS:**
  - Si la toma principal termina sin errores, se escribe el manifiesto normal de captura (`iphone-avfoundation`); el bloque `multicam` se añade solo si el segundo video también terminó bien.
  - La biblioteca de capturas ofrece el segundo video.
  - La importación verificada lo incluye; si no se puede leer, **se descarta solo ese archivo**, nunca la toma principal.
- **Editor:**
  - `importCapture` abre el segundo video y añade la capa del recuadro **en el mismo lote** que el video principal: un solo deshacer.
  - Usa `pipOverlayOp` de `core/multicam-plan.mjs`, la misma función que usa `applyPipComposition`: no hay un segundo compositor.
  - Desfase: si la segunda cámara empezó después, el recuadro se coloca más tarde; si empezó antes, se recorta su inicio.
  - Audio: el recuadro queda en silencio, así que solo suena la cámara principal y no hay audio duplicado.
  - Si el segundo video falta, es ilegible, los metadatos son inválidos o los dos videos no coinciden en el tiempo, se importa **solo la cámara principal**, con un aviso. Los originales nunca se modifican.
- **Criterio de aceptación**, cumplido en el editor real (Chromium): con archivos y metadatos válidos se obtiene una composición editable sin rehacer la sincronización a mano.

## 3. Macrobloque B · Sonido del video en escenas LIVE (implementado)

- **Android** (RootEncoder 2.8.1):
  - `WivraVideoAudioFeed` decodifica la pista de audio con MediaCodec, como máximo unos 2 s por delante.
  - `WivraSceneAudioEffect` la mezcla en el búfer del micrófono mediante `CustomAudioEffect`.
  - En el teléfono el video suena en silencio, para evitar eco.
  - Control: «Sonido del video: va al LIVE / silencio».
- **iPhone** (HaishinKit 2.2.5):
  - `AVAssetReader` añade el audio como pista 1 de un `MediaMixer` con mezcla multipista de audio (sigue siendo una sola cámara).
  - El micrófono es la pista 0 y marca el ritmo; la pausa silencia solo esa pista.
  - Control: «Sonido del video en el LIVE».
- **Sin micrófono en el LIVE**, se mantiene el comportamiento anterior y se avisa: el video se ve, pero su sonido no se transmite.
- **Evaluado y descartado** para este caso: `MixAudioSource` / `AudioPlaybackCapture` en Android. Exigen el consentimiento de captura de pantalla (MediaProjection) solo para oír un archivo propio, y además capturan el audio de otras apps. La mezcla directa del archivo no necesita ningún permiso.

## 4. Macrobloque C · Pantalla o aplicación como fuente (auditoría y diseño, sin código)

**Lo que ya existe (ChatGPT, Android full):**
- `WivraScreenLiveActivity` y `WivraScreenLiveService`.
- Consentimiento de MediaProjection en cada sesión, con un token de un solo uso.
- Servicio en primer plano de tipo `mediaProjection` **antes** de `getMediaProjection()`.
- Si se revoca el permiso, la sesión termina.
- `ScreenSource` de RootEncoder como video principal; solo imagen y sin MP4.

**Por qué no se combina hoy con la cámara:**
1. El LIVE de cámara vive en una Activity que se detiene al salir de la pantalla (`onStop` → `stopAndReview`). Es una regla de seguridad de ChatGPT: para mostrar otra app hay que salir de Wivra.
2. Android no deja usar la cámara ni el micrófono desde segundo plano, salvo desde un servicio en primer plano de tipo `camera` y `microphone`. Eso requiere **permisos nuevos** (`FOREGROUND_SERVICE_CAMERA` y `FOREGROUND_SERVICE_MICROPHONE`).

**Diseño propuesto** (reutiliza el capturador existente, sin un segundo capturador):
- La escena «Pantalla + cámara» corre dentro de `WivraScreenLiveService`.
- La pantalla es la base (`ScreenSource`).
- La cámara entra como capa (`SurfaceFilterRender`), con la misma geometría de `WivraLiveScenes`.
- Un botón en la notificación detiene **solo** la pantalla compartida.
- La revocación vuelve a la escena de cámara o termina la sesión, nunca de forma silenciosa.

**Bloqueo real:** añadir esos dos tipos de servicio y sus permisos es una **decisión del propietario** (permisos mínimos) y debe coordinarse con ChatGPT, dueño de `WivraScreenLiveService`.

**iPhone:**
- ReplayKit en la app (`RPScreenRecorder`) solo captura la propia app Wivra.
- Para capturar otras apps hace falta una *Broadcast Upload Extension*: un objetivo aparte, con memoria limitada y sin acceso a la cámara.
- Mientras se muestra otra app, Apple no permite tener la cámara de Wivra activa.
- **Conclusión:** en iPhone no hay una forma segura y completa de «cámara + otra app». Queda como límite declarado.

## 5. Pruebas

| Prueba | Resultado | Tipo |
|---|---|---|
| core | 118/118 | Lógica |
| app (incluye `capture-multicam.test.mjs`) | 636/636 | Lógica y contrato |
| streaming (contratos Android/iOS) | 444/444 + 2 nuevas | Contrato |
| JVM (escenas, mezclador PCM, multicámara) | 10/10 en local | Lógica |
| Editor real en Chromium: importación del par (`tools/browser-multicam-import.cjs`) | 7/7 | Navegador, medios sintéticos |
| CI del PR #173 | Ver el PR (SHA exacto) | Compilación Android/iOS |

## 6. Siguiente macrobloque exacto

1. Si el propietario aprueba los permisos: escena «Pantalla + cámara» en Android dentro de `WivraScreenLiveService`, coordinada con ChatGPT.
2. Si no: prueba física autorizada. Toma doble en iPhone → editor, y live con escenas y video con sonido hacia un servidor RTMP de prueba.

— Claude
