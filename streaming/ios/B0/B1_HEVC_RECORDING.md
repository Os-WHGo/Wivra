# Wivra Meta B1A: grabación HEVC en iPhone (video sin audio)

**Estado:** código experimental, todavía sin conexión física Meta ni reproducción real comprobada. Basado en B0, compilación simulador + generic iPhone ARM64 previamente superada. PR #46 apilado sobre PR #35.

## Única miniapp de prueba
- Modo B0: RAW para vista previa; mostrar imágenes reales si hay gafas conectadas.
- Modo B1A: HEVC hvc1 comprimido, contador de muestras; se pierde la vista previa hasta que conectemos VideoToolbox.
- Pulsar Grabar HEVC: esperar cuadro clave HEVC; empezar escritura en Documents/WivraRecordings/Wivra_Meta_UUID.mov.
- Pulsar Detener y guardar MOV: cerrar AVAssetWriter, verificar bytes, exponer enlace de compartir desde iPhone.
- **No hay audio**; B1B incluirá micrófono HFP autorizado y sincronización. No hay LIVE, no exportación automática a la biblioteca del editor Wivra y no se transfieren videos viejos almacenados en gafas.

## Control de riesgos
- No se altera firmware ni se modifican límites de las grabaciones nativas de las Ray-Ban.
- No afirmar duración ilimitada. Gafas y SDK pueden cortar video por temperatura, batería o conexión.
- Grabar en primer plano; esperar confirmación de archivo antes de bloquear pantalla.
- Todos los originales se conservan, no se envían a ningún servidor. Si el formato inicial necesita correcciones, se corrige aquí antes de B1B.
- En el primer ensayo solo 15 a 30 segundos. Reproducir completo el archivo, revisar inicial/final, seek, FPS y duración. Si funciona, probar 3, 8 y 15 minutos por separado con descanso/seguridad.
- Antes de probar B1A, aprobar B0 con gafas físicas y contador de fotogramas estable por 5 minutos.

## Entrada del editor
El .mov se comparte desde el iPhone para importarlo manualmente. El adaptador a un MediaAsset estable del editor de Claude es una integración futura y requerirá coordinación entre ramas. El usuario final tendrá una sola Wivra.

## Próximo paso exacto
Verificar que GitHub Actions compile el proyecto B1A para simulator y generic iOS ARM64 sin firma. Corregir errores Swift. Después Xcode/Apple Team para instalar en iPhone y probar Meta DAT con gafas reales. Sin un dispositivo físico no se valida la grabación.

Fuentes: Meta DAT iOS y ejemplo CameraAccess de Meta. La implementación de este PR es código original; SDK suministrado como dependencia SPM conforme a sus términos.