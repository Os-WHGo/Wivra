# Wivra Android · primera foto Ray-Ban → archivo local → Editor

## Alcance probado por código
Sin crear una segunda aplicación ni cambiar el Editor de Claude, esta rama introduce fotografía durante el video Ray-Ban Meta mediante la API estable DAT `stream.capturePhoto()` (distinta de la captura HQ experimental `camera.photo`). El usuario debe vincular y autorizar sus gafas, recibir cuadros de video reales y pulsar «Tomar foto». No hay fotos automáticas ni activación de la cámara sin consentimiento.

### 1. Captura
- La pantalla existente `WivraMetaPreviewActivity.kt` habilita el botón solo cuando la sesión y el stream reciben cuadros recientes, con exclusión de capturas simultáneas y procesamiento de la respuesta DAT en segundo plano.
- Las variantes `PhotoData.Bitmap` y `PhotoData.HEIC` se manejan por separado. La primera se codifica en JPEG de calidad 92 y la segunda conserva sus bytes HEIC. Hay límites de dimensiones y de tamaño de buffer.

### 2. Biblioteca de imágenes local
- `WivraMetaPhotoStore.kt` publica el resultado en `MediaStore.Images` dentro de `Pictures/Wivra`, con `IS_PENDING` mientras se escribe. Al fallar, elimina el archivo parcial.
- No requiere copiar bytes a JavaScript, base64, backend, cuenta cloud ni acceso a fotos ajenas. La consulta de foto reciente filtra solo archivos con prefijo Wivra_RayBan_ dentro de la carpeta Wivra.
- Los originales de fotos ajenas nunca se indexan ni tocan. Las imágenes capturadas por el usuario permanecen disponibles en su galería local; la app no las borra al cerrar.

### 3. Editor de Claude
- Cuando el usuario vuelve al Editor Android y pulsa el selector de videos y fotos (Claude PR #83), el WebView ofrece «Usar última foto Ray-Ban de Wivra» o «Buscar en Archivos». Entrega un `content://` real al selector ya existente del Editor, que puede crear un clip fotográfico de duración configurable.
- El selector de manifiestos `.wivra.json` del Editor no muestra esta opción de foto porque acepta audio/video/json, no `image/*`.
- No se modifica `app/` ni `core/`; preserva proyectos y traducciones de Claude y la cadena integradora #88.

## Pruebas y límites
- Test Node confirma contrato de captura, MIME, permisos, persistencia atómica y selector de medios.
- AndroidTest contiene un caso de JPEG sintético que lo guarda, consulta y borra. **Compilar el paquete de tests no equivale a ejecutarlo en un emulador**.
- CI compila APK y AndroidTest APK; el comportamiento con Ray-Ban real **NO se ha probado** y no se garantiza que el stream permanezca activo mientras llega la foto.
- Aún falta flujo equivalente iOS para esta función, biblioteca de fotos múltiples (ahora solo la foto reciente como atajo), video/audio independiente y comprobación de reproducción/exportación en teléfono. El video de vista previa sigue sujeto a validación de su formato YUV.
- En Android 10+ MediaStore de archivos de autor permite guardar imágenes sin solicitar lectura masiva de medios; Wivra Android establece `minSdk=31`, por lo que la ruta es válida dentro de la base actual.
- La función no incluye las capacidades Meta experimentales de audio PCM/HQ photo/speech y no añade servicios de pago. No se modifica `main`.

## Cómo hacer prueba con hardware cuando esté disponible
1. Autorizar DAT cámara desde Meta AI, emparejar gafas y esperar cuadros.
2. Pulsar «Tomar foto». Confirmar que aparece en Imágenes/Wivra con JPEG o HEIC legible y sin pérdida de orientación.
3. Volver al Editor, usar el selector videos/fotos, elegir la foto reciente; verificar que crea un clip, guarda/reabre el proyecto y se exporta con la duración seleccionada.
4. Desconectar/reconectar las gafas. Si un permiso es denegado, no debe crearse un archivo vacío. Comprobar almacenamiento libre, temperatura y fotos múltiples.

## Referencias oficiales
- https://github.com/facebook/meta-wearables-dat-android/blob/main/plugins/mwdat-android/skills/camera-streaming/SKILL.md
- https://github.com/facebook/meta-wearables-dat-android/tree/main/samples/CameraAccess
- https://developer.android.com/training/data-storage/shared/media