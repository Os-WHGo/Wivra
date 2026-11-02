# Wivra Android: una app, un editor, host nativo inicial

Este módulo usa el archivo generado app/dist/agentcut.html de Claude como fuente única del editor. Gradle lo copia de la raíz junto con app/packs/catalog.json; no hay otro editor independiente.

## Ya implementado en Android B0
- MainActivity nativa Java/WebView, HTML incluido y disponible sin servidor.
- Selector de medios del WebView, con archivos elegidos explícitamente por el usuario.
- JavaScript y DOM Storage habilitados para el editor local.
- Restricción de navegación externa dentro de WebView y acceso universal desde file URLs desactivado.
- CI genera APK debug y comprueba recursos; no exige servicios de pago.

## Integración SDK Meta Android
- Se incluyen las dependencias oficiales `com.meta.wearable:mwdat-core:1.0.1` y `mwdat-camera:1.0.1` desde Maven Central, con compilación sin suscripción.
- Se deshabilitan por defecto las analíticas y captura de crashes del SDK mediante opciones oficiales.
- El SDK aún NO está conectado al ciclo de vida de `MainActivity`; registrar una aplicación Meta y comprobar dispositivos/consentimiento antes de realizar conexión. No inventar `APPLICATION_ID`.
- La paridad Ray-Ban iOS/Android es obligatoria como **objetivo de producto**; limitaciones del SDK o hardware se mostrarán con precisión.

## Pendiente sin exagerar
- Cámara nativa Android, la **conexión funcional de Meta DAT Android** (dependencias ya añadidas), importación automática de manifiestos, LIVE y audio multipista: aún no conectados a este host.
- Persistencia real de IndexedDB, foto principal, exportación HEVC y archivos largos: pendientes de probar en Android real.
- Modelos externos opcionales sujetos a consentimiento, CORS, licencias y autenticación oficialmente permitida.
- DAT developer preview no implica autorización para distribuir funciones experimentales.
- APK debug no equivale a publicación Google Play.
- Si el esquema file de WebView limita el almacenamiento/exportación, migrar a un origen local seguro y bridge versionado.

## Compilación local
Requiere JDK17, Android SDK36, Gradle8.13 y Android Gradle Plugin8.11.1. Primero ejecutar node app/build.mjs para actualizar el HTML y luego gradle -p streaming/android :app:assembleDebug. La CI demuestra compilación, no funcionamiento de cámara o gafas.
