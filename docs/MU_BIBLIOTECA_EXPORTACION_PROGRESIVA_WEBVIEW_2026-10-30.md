# Biblioteca tecnológica MU · Entrada: guardar archivos grandes desde un WebView sin agotar la memoria

Origen: Wivra, PR #132 (30-10-2026), escrito por Claude. Está aquí porque esta sesión no tuvo acceso al repositorio de la biblioteca central (`Os-WHGo/Proyecto-Cero`). **Copiar a la biblioteca central** cuando el propietario lo autorice.

## Problema reutilizable
Una app híbrida (HTML en WebView, en Android e iOS) genera un archivo grande en JavaScript: un video de `MediaRecorder`, una exportación o un ZIP. Si se junta todo en un `Blob`, la memoria crece con el tamaño del archivo y el sistema puede cerrar la app. Además, en Android el WebView no guarda `<a download>` con URL `blob:` sin código nativo, y no tiene `navigator.share`.

## Patrón recomendado: «sumidero progresivo con CRC»
1. Producir el archivo **por fragmentos** (`MediaRecorder.start(1000)` o un `WritableStream`).
2. Enviar cada fragmento al nativo **en orden**, esperando la confirmación (`seq`, `written`) y con una **cola máxima** (p. ej. 48 MiB). Si la cola se llena, se corta con un error claro, sin crecer sin límite.
3. El nativo escribe directamente en el destino final, oculto mientras tanto:
   - **Android:** MediaStore con `IS_PENDING=1`, `ParcelFileDescriptor.AutoCloseOutputStream` y `fd.sync()`.
   - **iOS:** un archivo `.partial` en Application Support, marcado como excluido de la copia de seguridad.
4. Al cerrar: comparar bytes, número de fragmentos y **CRC-32** (IEEE/zlib, igual en JS, `java.util.zip.CRC32` y una tabla Swift); revisar la cabecera del contenedor; **releer el archivo del disco**; solo entonces hacerlo visible (`IS_PENDING=0` o renombrar).
5. Ante cualquier fallo, cancelación o cierre: borrar el parcial. Al arrancar, borrar los huérfanos propios, filtrando por prefijo, carpeta y paquete propietario.
6. Conservar el método anterior como alternativa seleccionable hasta validar el nuevo en hardware.

## Canales JS → nativo verificados
| Plataforma | Canal recomendado | Binario | Notas |
|---|---|---|---|
| Android | `androidx.webkit` `WebViewCompat.addWebMessageListener` (Apache-2.0) | Sí: `ArrayBuffer` con `WEB_MESSAGE_ARRAY_BUFFER` | Asíncrono, responde con `JavaScriptReplyProxy` (en el hilo principal). Las páginas `file://` obligan a usar la regla de origen `*`: filtrar por `isMainFrame` y la URL exacta. Mejor que `addJavascriptInterface`, que es síncrono y solo admite texto |
| iOS | `WKScriptMessageHandlerWithReply` | No: base64 (+33 %) | No existe canal binario web→nativo ([foro de Apple](https://developer.apple.com/forums/thread/830260)). Hacer la E/S en un `actor`, nunca en el hilo principal |

Marco binario usado: cabecera de 16 bytes en little-endian (`'WVX1'`, rid, token, seq) seguida de los datos.

## Hallazgos y cuidados
- Chromium (versión de Playwright 2026) eligió `video/mp4;codecs=avc1,opus` en `MediaRecorder`. Al concatenar sus fragmentos sale un MP4 fragmentado que ffmpeg decodifica completo **[V]**.
- El WebM de MediaRecorder no lleva duración en la cabecera; algunas galerías no muestran la duración. Se arregla con un parche posterior al cierre (pendiente).
- MediaStore renombra los nombres duplicados en silencio («(1)»): conviene usar nombres únicos (marca de tiempo + token) para que la app informe el nombre correcto.
- `ParcelFileDescriptor.AutoCloseOutputStream` cierra el descriptor junto con el flujo, lo que permite a MediaStore terminar de registrar el archivo.
- Swift 6: no capturar el manejador (que no es `Sendable`) dentro de `Task { @MainActor }`; capturar solo el `WKWebView`, que está aislado al hilo principal.
- FFmpegKit está retirado (enero de 2025); mp4-muxer y webm-muxer están obsoletos en favor de Mediabunny (MPL-2.0).
- En este entorno de agentes: `dl.google.com` y `download.swift.org` están bloqueados (403) y Maven Central puede responder 429. El núcleo Kotlin se pudo compilar con Gradle desde el Plugin Portal. Android e iOS se compilan en GitHub Actions.

## Pruebas reutilizables
- Puente simulado en Playwright (`page.exposeFunction`) que escribe a disco: prueba el flujo real de `MediaRecorder` sin teléfono (`tools/browser-progressive-export.cjs`).
- Instrumentación Android que abre el WebView real del APK y escribe en el MediaStore real (`WivraExportBridgeWebViewTest`).
- Prueba de humo de un actor Swift en macOS con `xcrun swiftc -swift-version 6` (`streaming/tests/WivraExportStoreSmoke.swift`).
