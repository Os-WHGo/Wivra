# Wivra Meta B1A: grabación HEVC en iPhone (video sin audio)

**Estado (13-oct-2026): compilación B1A aprobada en GitHub Actions** para iOS Simulator y generic iPhone ARM64 sin firma, [run 38487153632](https://github.com/Os-WHGo/Wivra/actions/runs/38487153632). Aún SIN instalación en iPhone, SIN conexión física Meta, SIN reproducción real de archivos. PR #46 apilado sobre PR #35.

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

## Compilación de prueba para un iPhone
La CI de Xcode ha generado y publicado correctamente un IPA **sin firma** llamado WivraMetaB1-UNSIGNED.ipa. [Build 38487416217](https://github.com/Os-WHGo/Wivra/actions/runs/38487416217): simulador, generic iOS ARM64, empaquetado y subida de artefacto **success**. Artefacto WivraMetaB1-UNSIGNED-arm64 (unos 5.3 MB), disponible hasta aproximadamente el 20 de octubre de 2026. La subida no equivale a tener un IPA firmado. Un IPA **sin firma NO se puede instalar directamente** en iOS. El usuario debe firmarlo legítimamente con su propia cuenta Apple y los permisos de DAT antes de usarlo en su teléfono; no debe compartir contraseñas, certificados o tokens en GitHub o ChatGPT. Dependiendo del método de instalación puede ser imprescindible Xcode/macOS y provisión de entitlements.
La creación de este archivo no prueba compatibilidad Bluetooth ni conexión real. La app seguirá experimental. No incluir claves privadas ni secretos en los artefactos públicos del repositorio.
## Próximo paso exacto
Verificar que GitHub Actions compile el proyecto B1A para simulator y generic iOS ARM64 sin firma. Corregir errores Swift. Después Xcode/Apple Team para instalar en iPhone y probar Meta DAT con gafas reales. Sin un dispositivo físico no se valida la grabación.

Fuentes: Meta DAT iOS y ejemplo CameraAccess de Meta. La implementación de este PR es código original; SDK suministrado como dependencia SPM conforme a sus términos.