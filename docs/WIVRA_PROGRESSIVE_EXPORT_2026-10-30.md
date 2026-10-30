# Wivra · Exportación prolongada por escritura progresiva (30-10-2026)

Autor: Claude. Rama `claude/wivra-progressive-export-20261030`, PR borrador #132 hacia la rama de #131. Sin fusión a `main`. Sin servicios de pago.

Leyenda: **[V]** verificado (con fuente o prueba ejecutada) · **[NV]** no verificado.

## 1. Punto de partida (código revisado)

- `app/export.mjs` grababa con `MediaRecorder` y guardaba cada fragmento en `chunks[]` hasta terminar; después creaba un `Blob` único. **[V]** Para 1 h de video el propio estimador del repo calcula unos 1.350 MB en memoria (`exportMemoryRisk(3600)`).
- `app/template.html` ofrecía el `Blob` mediante `<a download>` y `navigator.share`.
- Android (`MainActivity.java`) no registra `DownloadListener` ni puente JS. **[NV]** Probablemente el `Blob` no se puede guardar desde el WebView de Android. Hay que confirmarlo en un teléfono.
- iOS (`WivraEmbeddedEditorScreen.swift`) cancela la navegación a URL `blob:`. Guardar depende de `navigator.share` dentro de WKWebView. **[NV]**

## 2. Alternativas comparadas

| Opción | Compatibilidad | Licencia | Rendimiento / memoria | Mantenimiento | Decisión |
|---|---|---|---|---|---|
| **MediaRecorder + escritura nativa progresiva** (esta PR) | Android WebView con AndroidX `WebMessageListener`; iOS WKWebView con `WKScriptMessageHandlerWithReply` | AndroidX webkit Apache-2.0 **[V]**; resto, código propio | Tiempo real; memoria acotada (cola ≤ 48 MiB) **[V en Chromium]** | API oficiales de Google y Apple | **Implementada.** Cambio mínimo: el render del editor sigue igual |
| File System Access / OPFS en el WebView | `showSaveFilePicker` no existe en WebView **[NV]**; OPFS sí en Chromium, pero el archivo queda dentro del origen | Estándar web | Bueno | — | Descartada: igual hace falta un paso nativo para llegar a la galería |
| WebCodecs + Mediabunny (`StreamTarget`, con contrapresión) | iOS: completo desde iOS 26 y parcial entre 16.4 y 18.7 ([caniuse](https://caniuse.com/webcodecs)) **[V]** | MPL-2.0 **[V]** (`docs/RESOURCES.md`) | Puede ir más rápido que el tiempo real; salida por flujo | Activo; sustituye a mp4-muxer, ya obsoleto ([repo](https://github.com/Vanilagy/mp4-muxer)) **[V]** | **Siguiente paso** (plan B, issue #11): reutiliza este mismo sumidero nativo como destino |
| Composición nativa: Media3 Transformer (Android) / AVAssetWriter (iOS) | Nativa, por hardware | Apache-2.0 / SDK de Apple **[V]** (`docs/OPEN_SOURCE_MAP.md`) | La mejor; sin WebView | Oficial | A largo plazo: obliga a reescribir el render (textos, capas, filtros, formas) en dos plataformas |
| FFmpegKit | — | LGPL/GPL | — | **Retirado** en enero de 2025 ([repo](https://github.com/arthenica/ffmpeg-kit)) **[V]** | Descartada |
| StreamSaver.js (service worker) | No funciona en páginas `file://` | MIT | — | — | Descartada |
| `addJavascriptInterface` en Android | Sí | — | Llamada síncrona que bloquea el hilo JS en cada escritura; solo admite texto (base64 +33 %) | — | Descartada: `WebMessageListener` es asíncrono, binario y filtra el marco de origen |

Fuentes del canal Android: la [documentación de `WebViewCompat.addWebMessageListener`](https://developer.android.com/reference/androidx/webkit/WebViewCompat) describe `WEB_MESSAGE_ARRAY_BUFFER` y `getArrayBuffer()` para enviar datos de la web a la app **[V]**. En iOS no hay forma de enviar un ArrayBuffer al nativo por el manejador de mensajes; lo habitual es usar base64 ([foro de Apple](https://developer.apple.com/forums/thread/830260)) **[V]**.

## 3. Arquitectura implementada

```
MediaRecorder (1 s) ──► export-sink.mjs ──(orden + CRC-32, cola ≤ 48 MiB)──► puente nativo
                                                     Android: ArrayBuffer 'WVX1' │ iOS: base64
                                                                                 ▼
             Android: fila MediaStore IS_PENDING (Movies/Wivra)  ·  iOS: Application Support/WivraExports/*.partial
                                                                                 ▼
                 finish: totales del editor = archivo → fsync → RELECTURA del disco (CRC) → visible / renombrado
                 cualquier fallo, cancelación, salida o reinicio → se borra el parcial
```

- **Protocolo v1:** `hello` → `begin(mime, estimatedBytes)` → `chunk(seq, datos)`, uno detrás de otro → `finish(bytes, crc32, chunks)` | `abort`; después, `share`. Los números (cabecera de 16 bytes y fragmento máximo de 32 MiB) están fijados por un test de contrato JS↔Kotlin↔Swift.
- **Integridad:** se comprueban el orden de los fragmentos, el total de bytes y de fragmentos, el CRC-32 (IEEE, el de zlib) y la cabecera del contenedor (EBML para WebM, `ftyp` para MP4). Antes de publicar se relee el archivo del disco.
- **Espacio:** `begin` exige el tamaño estimado más 200 MB libres. Durante la grabación se vuelve a comprobar cada 16 MiB. Si falta espacio se corta con un mensaje claro y no queda ningún archivo a medias.
- **Ciclo de vida:** si la app pasa a segundo plano, la exportación se interrumpe como antes y se borra el parcial. Al cerrar el editor (`dispose`/`deinit`) también se borra. Al iniciar la app se eliminan los huérfanos de un proceso cerrado a la fuerza. Nunca se toca un video terminado ni un archivo de otra app.
- **Seguridad:** solo atiende al marco principal del HTML empaquetado. Solo puede crear archivos `Wivra_Export_*` nuevos y compartirlos; nunca lee, lista ni borra otros medios.
- **Alternativa:** el selector «Cómo guardar» solo aparece si hay puente nativo; «En memoria (anterior)» conserva intacto el comportamiento previo.

## 4. Pruebas ejecutadas

| Prueba | Dónde | Resultado |
|---|---|---|
| `app/tests` (incluye 13 nuevas de `export-sink.test.mjs`) | Node 22 local | **[V]** 437/437 |
| `streaming/tests` (incluye el contrato nativo nuevo) | Node 22 local | **[V]** 298/298 |
| `WivraProgressiveExportSessionTest` (núcleo Kotlin) | JVM local, Kotlin 2.2.20 | **[V]** 9/9 |
| `tools/browser-progressive-export.cjs`: MediaRecorder real → puente Android simulado → disco | Chromium (Playwright) local | **[V]** 12/12: idéntico byte a byte, CRC, ffmpeg decodifica todo, primer fragmento en disco 4,5 s antes del final, cancelación y fallo de disco sin restos, modo memoria intacto |
| `WivraExportStoreSmoke.swift` (7 escenarios) y compilación iOS Swift 6 (simulador y arm64 sin firma) | macOS CI `compile-ios` e IPA del ensamblaje, [run 41140012723](https://github.com/Os-WHGo/Wivra/actions/runs/41140012723) | **[V]** success |
| Android: APK, test APK y pruebas unitarias JVM (`testFullDebugUnitTest`) | `android-editor-shell` y ensamblaje [run 41140012645](https://github.com/Os-WHGo/Wivra/actions/runs/41140012645) | **[V]** success |
| Matriz de navegador en CI (incluye `browser-progressive-export.cjs`) | `browser-matrix` | **[V]** success |
| `WivraExportStoreTest` y `WivraExportBridgeWebViewTest` (MediaStore real y WebView real del APK) | Emulador API 35, [job 124352862248](https://github.com/Os-WHGo/Wivra/actions/runs/41140012645/job/124352862248) | **[V]** 10/11 en `feed65b`: el WebView real → puente → galería pasó. Falló la limpieza `finally` de una prueba: borraba una fila ya eliminada y Android responde `SecurityException`. Corregido en el commit siguiente; **revalidar en el CI** |

## 5. Riesgos y limitaciones

- **No probado en teléfonos físicos**, ni con la pantalla bloqueada, ni con gafas Ray-Ban. No se afirma compatibilidad.
- Con pantalla apagada o la app en segundo plano, la exportación **se detiene** (como antes). La escritura progresiva no lo cambia, porque el render ocurre en el WebView.
- El **WebM** de MediaRecorder sigue sin duración ni índice en la cabecera: algunas galerías no muestran la duración ni permiten saltar dentro del video. Ya pasaba antes. Chromium elige MP4 fragmentado cuando puede.
- La tasa de bits sigue bajando en videos largos (hasta 3 Mbps). Con escritura progresiva la memoria ya no lo exige; subirla es una decisión de calidad frente a tamaño que toma el propietario.
- iOS: el video final queda en el almacenamiento privado de Wivra hasta que la persona lo comparte o guarda. Todavía no hay pantalla para gestionar ni borrar exportaciones antiguas.
- iOS: el base64 añade un 33 % de datos por fragmento; con un fragmento a la vez es asumible. **[NV]** impacto en batería y temperatura.
- Android: el canal usa la regla de origen `*`, porque las páginas `file://` no tienen un origen que se pueda nombrar. Se compensa exigiendo el marco principal y la URL exacta del asset, y con la navegación ya bloqueada.
- Si el sistema mata la app, la fila pendiente se borra en el siguiente arranque (y Android caduca las filas pendientes por su cuenta).

## 6. Pendiente

1. Prueba física: exportaciones de 10 min, 30 min y 1 h en Android e iPhone, midiendo memoria (Perfetto / Instruments), temperatura y espacio, y comprobando que el archivo se reproduce en Galería / Fotos.
2. Plan B con WebCodecs + Mediabunny usando este mismo sumidero (exportación más rápida que el tiempo real).
3. Corregir la duración del WebM en el nativo al cerrar el archivo, o preferir MP4 cuando el WebView lo admita.
4. iOS: opción de guardar directamente en Fotos (requiere `NSPhotoLibraryAddUsageDescription`) y gestión de exportaciones antiguas.
5. Traducir los textos nuevos del diálogo de exportación (ahora solo en español, como el resto de ese diálogo).
