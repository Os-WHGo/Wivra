# Wivra B1H — cámara nativa del iPhone (experimental)

**Rama:** `chatgpt/iphone-b1h-native-camera-20261015`, basada en el HEAD de PR #60. No fusionar a `main` ni alterar el editor de Claude.

## Implementado en código
- Nueva pestaña **iPhone** junto a la pestaña **Ray-Ban**; al entrar en iPhone se solicita terminar la sesión Meta. Al cambiar de pestaña o pasar a segundo plano, se ordena detener la cámara del iPhone.
- `AVCaptureSession` con `AVCapturePhotoOutput` y `AVCaptureMovieFileOutput` en una sesión, vista previa `AVCaptureVideoPreviewLayer`. Foto JPEG independiente durante una sesión de grabación MOV: se permite solicitarla, **pero no se garantiza ausencia de saltos o interrupciones hasta prueba física**.
- Selector de cámaras traseras (principal, ultra gran angular o teleobjetivo cuando existan) y frontal según detección del dispositivo. Para evitar conflictos, se elige lente con cámara detenida.
- Controles **Auto/Pro** según `AVCaptureDevice`: ISO, obturación conservadora entre 1/1000 y 1/30 s (limitada además por el formato) y enfoque manual solo si la lente lo admite. Esto **no implementa larga exposición ni apilado nocturno**.
- Audio de MOV mediante entrada de micrófono que el sistema permita agregar. Si iOS deniega el micrófono, la cámara puede guardar video sin audio. **La selección manual Ray-Ban / AirPods / DJI y pistas de audio separadas son otros bloques aún no conectados a esta cámara nativa.**
- Guardado local de JPEG/MOV en `Documents/WivraIPhoneMedia`. Estilos Core Image de B1G exportan una **copia JPEG** y conservan el original. Sin subida de archivos.
- Permisos iOS de cámara y micrófono con textos de propósito; inicio de `AVCaptureSession.startRunning()` fuera del hilo UI.

## Límites
- Sin funciones LIVE/RTMPS, escenas o efectos sobre fotogramas de video; sin HEVC configurable del iPhone, formato RAW/ProRAW, control de flash, foto de larga exposición, cámara múltiple o grabación en background.
- Formato MOV y preset `.high` de AVFoundation, **no** garantía de resolución o códec concretos. No promete continuidad perfecta durante fotografía, exposición Pro a 30 FPS sostenidos, ni soporte físico universal de lentes.
- El éxito de CI solo demuestra compilación y comprobación estática. Ninguna foto, video, audio, temperatura o sincronización se ha verificado físicamente.

## Lista mínima de ensayo físico
1. Comprobar autorización de cámara/micrófono y prohibición de iniciar sin permiso de cámara.
2. Probar cada lente disponible con vista previa, 10 fotos y calidad/EXIF originales.
3. Grabar video durante 2 minutos y tomar al menos 5 fotografías distribuidas durante la grabación. Revisar MOV cuadro a cuadro y continuidad de audio.
4. Activar Pro, probar ISO/obturación/enfoque; comprobar indicadores de límites y que Auto restaura enfoque/exposición continuos.
5. Cambiar a pestaña Ray-Ban y poner Wivra en segundo plano: confirmar que no sigue usando cámaras/micrófono.
6. Exportar foto original y una edición; comparar archivos/hashes. Probar ausencia de audio y rutas Bluetooth con consentimiento.
7. Medir FPS, temperatura, batería y errores en una sesión de 10 minutos antes de plantear efectos de video en tiempo real.

**Próximos bloques:** conectar selección real de micrófono/pista independiente al provider nativo; pruebas Meta + iPhone; compositor de efectos LIVE con mediciones. No añadir dependencias de filtros de video sin auditoría.
