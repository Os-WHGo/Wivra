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

## Límites actuales

1. **El sonido del video no va al live.** En Android puede sonar por el altavoz del teléfono, para quien presenta. Llevarlo al live requiere una captura de audio interno con el permiso del sistema; es la siguiente fase.
2. Videos e imágenes se eligen **antes** de iniciar el live, porque salir de la pantalla detiene la transmisión (regla de seguridad existente). Durante el live solo se cambia de escena.
3. **Pantalla o aplicación como fuente:** no incluida. En Android es posible con el permiso de captura de pantalla y un servicio en primer plano; en iPhone Apple no permite usar la cámara mientras se muestra otra app.
4. En iPhone la salida sigue en el formato horizontal 16:9 de antes; el formato vertical para reels es otra decisión.
5. Las escenas no se guardan entre sesiones.

## Pruebas

- Core 118/118 y streaming 435/435 en local.
- JVM `WivraLiveScenesTest` 3/3 en local.
- CI en `4fe792b`: **8/8 workflows en verde**: Android (variantes full y capture, pruebas unitarias), iOS (prueba de humo de escenas en Swift 6, Simulator y arm64 genérico), Preflight, Beta Assembly (sin paquetes), App, Core y Director ×2.
- El CI encontró un error de Swift 6 y se corrigió: una constante de tamaño quedaba atada al hilo de HaishinKit (`nonisolated static let frame`).

## Prueba física (cuando el propietario la autorice)

1. Android → LIVE con cámara → «Fuentes»: elige un video corto y una imagen.
2. Inicia el live hacia un servidor de prueba y cambia de escena cada 10 s.
3. En la plataforma, comprueba que el recuadro está en su sitio y sin deformar, y que al terminar el video vuelve la cámara.
4. iPhone: activa «Usar escenas» y luego prepara la cámara. Repite los pasos 1 a 3.

— Claude
