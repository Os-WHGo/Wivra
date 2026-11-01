# Wivra · beta P0 · puerta de validación en dispositivos (2026-11-01)

**Estado:** protocolo preparado, **NO prueba física realizada**. No utilizar CI, vistas previas, LED, contador de frames o archivo de tamaño positivo como sustitutos de MP4 reproducible. Objetivo de beta: 2026-11-19. PR de trabajo: #138 sobre base #136; sin merge automático.

## Paquetes reproducibles

- Android: obtener el artefacto `Wivra-BETA-Android-DEBUG-apk` del workflow **Wivra Complete Beta Assembly (Mobile)** y verificar SHA256 con `Wivra-BETA-Android-SHA256` de la **misma ejecución y commit**. APK debug solo para pruebas, no publicación.
- iOS: `Wivra-BETA-iOS-UNSIGNED-ipa` es paquete arm64 **sin firma**. No afirmar que es instalable hasta firmar con credenciales autorizadas; comprobar identificador Meta DAT, Team ID, provisioning, entitlements y permiso de Fotos en la versión firmada. No pagar/contratar/publicar sin permiso.
- Correlacionar siempre SHA del HEAD, run, dispositivo, versión iOS/Android, firmware de gafas y hash de artefacto. No confundir artefactos antiguos con el commit actual.

## Matriz de aceptación (evidencia que debe aportar una prueba real)

| Puerta | Pasos y evidencia mínima | Criterio |
|---|---|---|
| P0-A. Captura iPhone | Conectar Ray-Ban Gen 2, registrar DAT, recibir fotogramas, capturar video, detener, confirmar **Keep**, abrir el MOV desde Archivos/AVPlayer. | Video reproducible, duración/frames plausibles, archivo local conservado. |
| P0-B. Señal caducada iOS | Durante preview interrumpir entrada de fotogramas >4 s sin detener sesión. Comprobar indicadores y botón de iniciar; volver a conectar; repetir con REC en curso. | Inicio/foto se deshabilitan sin muestras frescas; **Detener** sigue disponible durante REC. No asumir que frame recibido equivale a archivo final. |
| P0-C. Fotos iPhone | Confirmar Keep. Pulsar **Guardar video en Fotos**. Aceptar permiso add-only; abrir Fotos y reproducir con audio si fue combinado. Repetir denegando permiso y con MP4/MOV inválido. | Copia solo tras confirmación y video válido; original Wivra conservado; fallo visible sin borrado. |
| P0-D. Audio y mux iPhone | Probar sin audio y con micrófono seleccionado disponible; cambiar ruta durante toma. Comparar CAF independiente, MOV original y MOV combinado; comprobar desfase con aplauso. | No sustituir/reclamar audio de gafas sin prueba; no borrar originales; reportar sincronía medida. |
| P0-E. Bolsillo y bloqueo | Probar pantalla bloqueada con opt-in experimental, medir interrupciones reales de tiempo/frames/video final; repetir sin opt-in. | Marcar **experimental** hasta repetición en hardware. No prometer continuidad garantizada en iOS/Meta DAT. |
| P0-F. Android y fotos | Instalar APK debug autenticado, detectar conexión real, probar timeout de frame, capturar y recuperar, verificar MediaStore y editor sin red. | Emulador y dispositivo físico diferenciados. No inferir soporte de futuras gafas. |
| P0-G. LIVE Android | Usar servidor de prueba privado con RTMPS, consentimiento visible y micrófono opcional; cortar la red y comprobar MP4 local. | Transmisión real y archivo local verificables, sin persistir clave de stream. |
| P0-H. Exportación y montaje largo | Importar 81 segmentos en tres tandas; exportar 10/20/30/60 min con dispositivo monitorizado; comparar duración, tamaño, reproducibilidad, sincronía, temperatura y RAM. | Resultados de Chromium/Linux **no** sustituyen una exportación móvil de 60 min. |
| P1-futuro. Gen 3 / Display / gestos | Identificar capacidades expuestas por SDK/firmware y permisos reales, sin inferir por nombre de producto. | Solo anunciar capacidades físicamente verificadas; P1 no bloquea Gen 2. |

## Registro de una ejecución real

- Fecha, ejecutor, dispositivo, SO y firmware:
- Commit + workflow run + SHA256 paquete:
- Identificador de sesión y permisos otorgados:
- Fuente de cámara y micrófono:
- Duración solicitada vs real, contador de muestras vs muestras escritas:
- Evidencia de contenedor reproducible, capturas locales y Fotos:
- Eventos de pantalla bloqueada, pérdidas de enlace y recuperación:
- Resultado **PASS/FAIL/BLOCKED** por puerta y enlace al reporte/issue:
- Regresiones respecto del build anterior:

## Reglas de seguridad

- Mantener originales, archivos pendientes y audio CAF al fallar fotos, mux, exportación o red.
- No capturar sin permiso ni iniciar LIVE público sin confirmación explícita.
- No introducir dependencias que rompan compilaciones de la beta para experimentos Gen 3/Display.
- Evitar publicar o fusionar hasta autorización y matriz P0 revisada.


## Instalación de desarrollo en el iPhone del propietario sin publicar en App Store

**Ruta posible sin pagar una membresía Apple:** Apple permite firmar y ejecutar apps personales desde **Xcode con un Apple Account / Personal Team**. El perfil gratuito dura **7 días** y necesita reinstalación periódica; no permite distribución App Store ni TestFlight. La disponibilidad de capacidades Meta DAT/entitlements y la coincidencia TeamID se comprueban en la instalación real, **no están garantizadas** por compilar sin firma. Fuente oficial: https://developer.apple.com/help/account/basics/about-your-developer-account y https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices .

1. Requisitos: un **Mac** con Xcode apropiado para el SDK Meta 1.0.1, Node.js 22, XcodeGen, un iPhone físico y Ray-Ban Meta ya enlazadas mediante Meta AI. No introducir contraseñas o certificados en GitHub ni en el chat.
2. Usar la **rama de beta probada** indicada en la PR #138, nunca un viejo prototipo B0: `git clone https://github.com/Os-WHGo/Wivra.git`, `cd Wivra`, `git fetch origin`, `git switch chatgpt/wivra-dat-capability-probe-20261101`, `node app/build.mjs`, `cd streaming/ios/B0`, `xcodegen generate`, `open WivraMetaB0.xcodeproj`.
3. En Xcode > Settings > Apple Accounts, iniciar sesión con la cuenta del propietario. En el target `WivraMetaB0`, Signing & Capabilities, usar **Automatically manage signing**, elegir Personal Team o equipo de desarrollador autorizado y seleccionar el iPhone conectado. Si Xcode solicita registrar el dispositivo, hacerlo desde Xcode.
4. Configurar los datos **reales del proyecto Meta Wearables** del propietario para `META_APP_ID` y `CLIENT_TOKEN` en las Build Settings **locales**, sin introducirlos en el YAML o commits públicos. Verificar que el Team ID y el identificador de bundle estén registrados de forma compatible con la integración Meta. Los valores predeterminados de CI (`META_APP_ID=0` y token vacío) **no autorizan** la cámara real.
5. Mantener las declaraciones `Info.plist` de cámara, micrófono, Bluetooth y `NSPhotoLibraryAddUsageDescription`, y el esquema de devolución `wivrametab0://`. Habilitar Developer Mode del iPhone si Xcode lo solicita; activar Developer Mode de las gafas en Meta AI cuando esté disponible y autorizado.
6. **Build & Run** desde Xcode sobre el dispositivo físico. Registrar fecha, versión de iOS, firmware, permisos, commit y resultados de las puertas P0-A a P0-E. En el primer ensayo usar vista previa/captura en **primer plano**. Pantalla bloqueada permanece experimental.
7. Si no hay Mac o no resulta compatible la firma Personal Team con Meta DAT, detener la instalación y registrar el bloqueo. La IPA CI **UNSIGNED** no se instala directamente en un iPhone. No comprar membresía ni publicar hasta autorización expresa.

**Limitación importante:** esta ruta es una guía verificada contra documentación Apple, no una instalación ya ejecutada ni una garantía de acceso Meta. Para distribuir a terceros por TestFlight/App Store se necesita el programa adecuado; eso queda fuera de esta beta de prueba individual.
