# Wivra Android: vista previa local de Ray-Ban Meta (B1)

## Añadido
- La misma app Android que contiene el editor compartido incluye un panel ImageView para mostrar cuadros de video de Meta DAT en su pantalla nativa de conexión.
- Por defecto DAT entrega video decodificado a YUV. WivraI420PreviewConverter convierte I420 a NV21 y Bitmap mediante JPEG temporal **solo en memoria**, sin copia del código original de los ejemplos Meta.
- Actualización limitada a ~6 FPS para proteger CPU. El video del stream puede llegar más rápido, pero no se guarda ni envía a servidores.
- Se rechazan dimensiones inválidas, pixeles de más de 1280x1920 o buffers con tamaño distinto de 1.5 bytes por pixel. Se copia el frame antes de que el SDK recicle su almacenamiento.
- Channel.CONFLATED evita que se acumule una cola. Al desconectar se cancelan las tareas y se borra la imagen.
- Hay tests de instrumentación de un YUV sintético y buffers inválidos. CI compila los APK de pruebas, **no los ejecuta** en un emulador.

## Límites y verificación pendiente
1. Meta describe cuadros YUV sin comprimir pero no especifica públicamente el orden de planos para todos los dispositivos. I420 es una **hipótesis**, apoyada por observaciones externas, que debe verificarse con gafas reales y diversos modelos/firmware.
2. Convertir JPEG/Bitmap por frame usa CPU y memoria. Esta vista a 6 FPS es diagnóstica, no un preview acelerado de producción 24/30 FPS. Medir calor, batería, latencia, color y rotación.
3. Aún NO hay grabación, foto, audio, LIVE, exportación ni acceso de WebView a cuadros; módulos experimentales Meta siguen deshabilitados.
4. El editor original de Claude sigue intacto. PR de desarrollo sin cambios en main ni servicios de pago.

## Referencias
- Oficial SDK: https://github.com/facebook/meta-wearables-dat-android/blob/main/AGENTS.md
- Oficial guía de cámara: https://github.com/facebook/meta-wearables-dat-android/blob/main/plugins/mwdat-android/skills/camera-streaming/SKILL.md
- Observación de desarrolladores, NO especificación de Meta: https://github.com/facebook/meta-wearables-dat-android/issues/138

## Criterio del próximo hito
Con Ray-Ban físicas: preview estable sin pantalla negra, colores/rotación correctos, medir FPS, latencia y temperatura durante 10 minutos. Después implementar foto durante stream con stream.capturePhoto() y el índice de capturas compartido.