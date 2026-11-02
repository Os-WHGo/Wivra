# Wivra Android · cámara física del teléfono en la beta integral

**Bloque grande de cámara Android · 16 oct 2026 · PR #125 · ChatGPT**

Esta es **la cámara del teléfono**, independiente de la cámara Ray-Ban Meta DAT, dentro de la **misma app Android y el mismo editor de Claude**. No es un segundo editor ni una app separada.

## Flujo implementado en código
1. Abrir Wivra Android y entrar en «Cámara del teléfono», sin registro ni cuenta.
2. Conceder cámara al entrar (la app solo solicita permiso en esta actividad).
3. Ver vista previa y elegir cámara frontal/trasera. CameraX usa el sistema Android, sin APIs de pago.
4. **Tomar foto** JPEG y guardar en Pictures/Wivra, con botón disponible solo si el teléfono permite ligar una imagen a la sesión de video. **No afirmar fotografía simultánea** hasta probar el modelo de teléfono.
5. **Grabar video** en MP4 (FHD cuando está soportado, fallback de resolución en otros dispositivos). Por defecto **sin audio**; activar micrófono solicita RECORD_AUDIO. El audio habilitado es **pista integrada** en MP4, no canal de Ray-Ban ni CAF separada.
6. El archivo se almacena **en privado**. Tras finalizar, «Revisar videos pendientes» deja elegir Guardar, Decidir después o Eliminar con una segunda confirmación. Salir de la cámara detiene la grabación; si queda fragmento no vacío, se conserva para revisión, sin dar por hecho que reproduce hasta el final.
7. Al guardar, MediaStore mantiene el nuevo MP4 oculto (`IS_PENDING=1`) hasta cerrar la copia; entonces publica `IS_PENDING=0`. El original privado solo se intenta borrar **después** de publicar. Si la copia falla se mantiene el archivo privado.
8. Volver al editor **único** y pulsar añadir video/foto: se muestran atajos de medios Wivra guardados de la cámara del teléfono, los Ray-Ban ya guardados y «Buscar en Archivos». Nunca ofrecer pendientes sin guardar. URI `content://`, sin permisos de galería global ni importar automáticamente.

## Implementación y dependencias
- `streaming/android/app/src/main/java/com/oswhgo/wivra/WivraPhoneCameraActivity.kt`
- `streaming/android/app/src/main/java/com/oswhgo/wivra/WivraPhoneMediaStore.kt`
- `streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java` (solo menú/selector nativo).
- CameraX 1.5.3 oficial y libre (AndroidX camera2, lifecycle, video, view), licencias Apache-2.0/BSD. Fuente Android: https://developer.android.com/media/camera/camerax/video-capture y https://developer.android.com/jetpack/androidx/releases/camera
- Recursos de permisos/localización en manifest y seis traducciones.
- Tests de contrato `streaming/tests/android-phone-camera-native.test.mjs`; test Android instrumentado `WivraPhoneMediaStoreTest.kt` con medios **sintéticos**, no reales. El compilador puede validar sintaxis y API sin probar hardware.

## Puntos importantes que siguen pendientes en la **misma beta completa**
- Probar en Android real, permisos denegados/aceptados, rotación, front/rear, FPS, audio sincronizado, fotos en video, espacio, temperatura, pérdida de batería, múltiples clips, reabrir pending después de cerrar app y export desde Claude.
- Más modos Auto/Pro y exposición/larga exposición en Android (la interfaz CameraX actual es captura básica, NO modo Pro).
- Pista **independiente WAV/CAF**, selección de fuentes externas (USB/Bluetooth, DJI, Ray-Ban cuando su SDK lo permita) y sincronía manifest. Este cambio ofrece audio del micrófono **integrado** cuando el permiso lo permite.
- Grabaciones largas segmentadas/reanudables de la **cámara teléfono** (aquí se usa un archivo MP4 CameraX único; si una interrupción lo rompe, puede no ser reproducible).
- Integración de cámara teléfono con LIVE RTMP(S), escenas y dual cámara cuando SDK/hardware lo soporten. Aquí **NO existe publicador LIVE**.
- Grabaciones Ray-Ban mantienen su actividad DAT separada. Nunca insinuar que la cámara del teléfono está usando el micrófono de las gafas.

El cierre se verifica con la [matriz de requisitos de la beta integral #121](https://github.com/Os-WHGo/Wivra/issues/121). No se introducen servicios de pago, trackers, modelos, funciones adicionales ni un editor nuevo. No fusionar a `main` sin decisión del propietario.
