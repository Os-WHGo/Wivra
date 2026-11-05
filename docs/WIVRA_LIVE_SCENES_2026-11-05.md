# Wivra · Selector de escenas del LIVE (Claude, 05-11-2026)

Pedido del propietario: un **selector de escenas** para el live, donde cada escena puede tener varias fuentes (cámara, video, imagen y, más adelante, la pantalla o una aplicación).

Rama `claude/wivra-live-scenes-20261105`, PR en borrador #171, apilado sobre #169. Toca el live de ChatGPT solo con ganchos añadidos.

**No se ha probado en un teléfono ni con un servidor RTMP real.**

## Escenas

| Escena | Qué se ve | Android | iPhone |
|---|---|---|---|
| Cámara | Solo la cámara | Sí | Sí |
| Cámara + video | Cámara grande y video en un recuadro | Sí | Sí |
| Video + cámara | Video grande y cámara en un recuadro | No (la cámara es la base) | Sí |
| Cámara arriba, video abajo | La mitad inferior la tapa el video | Sí | Sí |
| Solo video | Video sobre fondo negro | Sí | Sí |
| Cámara + imagen | Logo o QR en un recuadro | Sí | Sí |
| Imagen (pausa) | Imagen completa; micrófono en silencio | Sí | Sí |

Reglas comunes (`core/live-scenes.mjs`):
- Una escena solo se puede elegir si sus fuentes están cargadas, para no mostrar nunca una capa vacía al público.
- Videos e imágenes se colocan sin deformarse.
- Cuando el video termina o falla, la emisión vuelve a la cámara.
- Cambiar de escena no reinicia la transmisión.

## Cómo funciona

- **Android:** capas de RootEncoder 2.8.1 sobre la cámara: un fondo negro, el video (MediaPlayer sobre `SurfaceFilterRender`) y la imagen (`ImageObjectFilterRender`).
  - RootEncoder borra las capas cada vez que se detiene la vista previa, así que Wivra las vuelve a crear en cada `startPreview`.
  - La copia MP4 local opcional guarda lo mismo que se transmite.
- **iPhone:** composición «offscreen» de HaishinKit 2.2.5 con `AssetScreenObject`, `ImageScreenObject` y un segundo `VideoTrackScreenObject` de la cámara para el recuadro.
  - Solo se activa con el interruptor «Usar escenas»; sin él, el live funciona exactamente igual que antes.

## Sonido del video en el live

El sonido del video **va al live** en los dos teléfonos, sin pedir permisos nuevos y sin capturar la pantalla ni el audio interno del teléfono.

- **Android:** Wivra decodifica la pista de audio del video (MediaCodec) al formato del live y la mezcla en el audio del micrófono, mediante `CustomAudioEffect` de RootEncoder.
  - En el teléfono el video suena en silencio, para que el micrófono no recoja un eco.
  - Si inicias el live con una escena de video, el video empieza desde el principio con su sonido.
- **iPhone:** `AVAssetReader` lee el audio del video y lo añade como segunda pista (pista 1) del mezclador de HaishinKit; el micrófono es la pista 0.
  - La escena de pausa silencia solo el micrófono.
  - En iPhone el video vuelve a empezar cada vez que entras en una escena con video.
- **Requisito:** el **audio del live (micrófono) debe estar activado**. Ese audio es el que marca el ritmo de la mezcla y es la única pista de audio que se transmite. Si no lo está, Wivra lo avisa.
- Volumen: el video suena a volumen normal y el micrófono se suma; si se pasa del máximo, se recorta (no se distorsiona por desbordamiento).
- Sin probar en un teléfono: la sincronización entre imagen y sonido del video y el volumen relativo con la voz.

## Límites actuales

1. Videos e imágenes se eligen **antes** de iniciar el live, porque salir de la pantalla detiene la transmisión (regla de seguridad existente). Durante el live solo se cambia de escena.
2. **Pantalla o aplicación como fuente:** no incluida. En Android es posible con el permiso de captura de pantalla y un servicio en primer plano; en iPhone Apple no permite usar la cámara mientras se muestra otra app.
3. En iPhone la salida sigue en el formato horizontal 16:9 de antes; el formato vertical para reels es otra decisión.
4. Las escenas no se guardan entre sesiones.

## Pruebas

- Local: core 118/118, streaming 437/437 y JVM 10/10 (escenas, mezclador PCM y multicámara).
- CI en `4fe792b` (escenas) y en `cbbc2da` (sonido del video): **8/8 workflows en verde** en los dos.
  - Android: variantes full y capture, pruebas unitarias.
  - iOS: pruebas de humo en Swift 6, Simulator y arm64 genérico.
  - Preflight, Beta Assembly (sin paquetes), App, Core y Director ×2.
- Errores que encontró el CI y se corrigieron: en Swift 6, una constante de tamaño atada al hilo de HaishinKit (`nonisolated static let frame`).
- Cambio coordinado en una prueba de ChatGPT (`ios-phone-live-native.test.mjs`): acepta la opción de audio multipista y ahora también exige que la sesión de cámara nunca sea `.multi`.

## Prueba física (cuando el propietario la autorice)

1. Android → LIVE con cámara → «Fuentes»: elige un video corto y una imagen.
2. Inicia el live hacia un servidor de prueba y cambia de escena cada 10 s.
3. En la plataforma, comprueba que el recuadro está en su sitio y sin deformar, y que al terminar el video vuelve la cámara.
4. iPhone: activa «Usar escenas» y luego prepara la cámara. Repite los pasos 1 a 3.

— Claude
