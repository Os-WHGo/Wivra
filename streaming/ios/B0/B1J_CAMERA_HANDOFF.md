# Wivra B1J · cambio seguro entre cámaras Ray-Ban e iPhone

**Rama:** `chatgpt/camera-source-handoff-20261015`, apilada sobre PR #68 (B1I). Solo código de captura nativa iOS. No se modifica Editor Claude, ni LIVE, ni `main`.

## Riesgo corregido

Antes, cambiar a la pestaña iPhone podía ordenar `MetaB0Model.endSession()` mientras el HEVC original, audio CAF, multiplexado MOV o manifiesto `.wivra.json` seguían finalizando asíncronamente. En sentido inverso, la transición dependía de que la vista iPhone desapareciera, no de que `AVCaptureSession.stopRunning()` terminase realmente.

## Contrato de traspaso

1. Un cambio de pestaña es **solicitud pendiente** si la cámara de origen no ha liberado todos los recursos. El usuario ve “Finalizando grabación y liberando cámara…”.
2. **De Ray-Ban a iPhone:** `endSession()` difiere el cierre si hay grabación activa o `recordingFinishing`. La finalización de HEVC/CAF, MOV combinado y JSON precede al fin de la sesión DAT. La nueva cámara no se ofrece hasta que `deviceSession` y `camera` sean nulas y no quede grabación pendiente.
3. **De iPhone a Ray-Ban:** el mismo `WivraIPhoneCamera` es compartido entre la app y la pantalla SwiftUI. El cambio espera `AVCaptureSession.stopRunning()`, el callback final del MOV y cualquier JPEG en vuelo.
4. Una segunda pulsación durante un traspaso pendiente no inicia otra cámara. No se intentan grabaciones en background.
5. Se mantienen las fotos durante MOV de B1H y la foto lenta solo-JPEG de B1I. No hay cambio de permisos, formatos, exposición, audio ni API de gafas.

## Limitaciones

CI verifica estructura del código y compilación nativa, no concurrencia real de AVFoundation/DAT ni persistencia en iPhone físico. Si el hardware no devuelve el evento de cierre, Wivra espera y **no** inicia la segunda fuente a ciegas. Antes de convertirlo en función de producción se requiere estado de error y recuperación supervisada para un cierre atascado.

## Pruebas físicas obligatorias

- Grabación Meta HEVC + CAF de varios minutos: cambiar a iPhone durante REC y durante “Finalizando”; confirmar que HEVC, CAF, MOV combinado y `.wivra.json` se guardan sin truncamiento y luego abre la cámara iPhone.
- Grabar MOV iPhone, obtener una fotografía simultánea y cambiar a Ray-Ban: confirmar que no aparecen cámaras solapadas ni MOV corruptos.
- Permisos de cámara/micrófono pendientes o denegados, cambios de lente, reconexión DAT, temperatura, segundo plano y pulsaciones rápidas de ambas pestañas.
- Verificar que la última fotografía, video y manifiesto puedan recuperarse tras reabrir y llegar al editor único sin duplicar el audio.

**Próxima etapa:** generar manifiesto normalizado de capturas iPhone y conectar las pistas con el único editor Wivra tras contrato de assets aprobado. — ChatGPT
