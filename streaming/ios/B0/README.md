# Wivra Meta B0 · primera prueba física Ray-Ban Meta → iPhone

**Fecha:** 13 octubre 2026 · **Estado actualizado:** **compilación Xcode para iOS Simulator completada con éxito en GitHub Actions** (run [38459815766](https://github.com/Os-WHGo/Wivra/actions/runs/38459815766), 13-oct-2026). Proyecto generado con XcodeGen; dependencias DAT 1.0.1 resueltas; `xcodebuild` de iOS Simulator completó `success`. **NO firmado/instalado en iPhone físico, NO probado con gafas reales y NO transmite RTMPS**.  
**Fase estricta actual:** **B0** (registro, sesión, permiso, **vista previa de fotogramas reales** y estadísticas). **NO hay emisión a Internet, audio, grabador ni importación de archivos antiguos en este prototipo.**

## Decisión para la primera etapa

- **Fuente:** Ray-Ban Meta Gen 2 y otras Meta autorizadas compatibles con DAT.
- **Transporte de prueba preferido:** Bluetooth Classic, por su posibilidad de mantener Wi-Fi normal en el teléfono. **DAT decide el enlace efectivo**: el perfil de cámara y los permisos del archivo Info.plist no fuerzan por sí solos que se use Bluetooth Classic. No hemos medido aún el transporte elegido en el iPhone real. Declarar `NSLocalNetworkUsageDescription` y `NSBonjourServices` es necesario para el SDK aunque B0 no solicite usar Wi-Fi.
- **Perfil equilibrado:** imagen decodificada **.raw**, `.medium` (solicitado **504×896**), **24 FPS** solicitados. Elegido para evitar escribir todavía un decoder VideoToolbox propio y demostrar fotogramas de verdad.
- **Perfil ahorro:** `.raw`, `.low` (solicitado **360×640**), **15 FPS**. Permite comparar autonomía/calor en sesiones separadas sin afirmar que consumirá menos antes de medirlo.
- **Observaciones en pantalla:** estado de registro, sesión, estado de cámara, frames **realmente recibidos**, FPS observado, resolución real y segundos desde primer frame. Si se sobrecalientan las gafas, respetar `thermalHot` y detener cámara.
- **Limitación:** `.raw` es una opción del DAT para recepción de frames decodificados; **no es un formato de archivo original**. **B1** cambiará a `.hvc1` para guardar el video HEVC sin recodificar desde la cámara cuando el pipeline funcione. Descargar **videos almacenados en las gafas** es otra función distinta, sin API pública confirmada.

## Requisitos de compilación

1. **Un Mac** con [Xcode 26.4+](https://developer.apple.com/xcode/) y Swift 6.3+, conforme a requisitos del [ejemplo oficial CameraAccess](https://github.com/facebook/meta-wearables-dat-ios/tree/main/samples/CameraAccess).
2. **iPhone iOS 17.2+** con la app **Meta AI** instalada y Ray-Ban Meta ya vinculadas mediante esa app.
3. Activar **Developer Mode** en Meta AI → **Settings / Your glasses / Developer Mode**; el nombre del menú puede variar con la versión. Si la opción no existe, confirmar firmware/compatibilidad en documentación oficial.
4. [XcodeGen](https://github.com/yonaskolb/XcodeGen) instalado en el Mac, por ejemplo `brew install xcodegen`. No es SDK de Meta, solo genera el proyecto Xcode a partir del YAML.
5. Cuenta Apple para **firmar e instalar en tu propio iPhone**. Con Xcode/Personal Team puede probarse una compilación de desarrollo bajo condiciones/limitaciones de Apple. Publicar en App Store/TestFlight público sigue siendo un proceso diferente.
6. Datos y gafas físicamente disponibles para B0. El simulador no prueba la antena Bluetooth ni la duración de batería.

## Compilar (sin copiar código SDK al repositorio)

```bash
git clone https://github.com/Os-WHGo/Wivra.git
cd Wivra
git fetch origin
git switch chatgpt/meta-dat-live-bridge-spike-20261013
cd streaming/ios/B0
xcodegen generate
open WivraMetaB0.xcodeproj
```

En Xcode:
- Destino: tu **iPhone** real; configurar **Signing & Capabilities → Team** y cambiar `PRODUCT_BUNDLE_IDENTIFIER` por uno exclusivo, sin cambiar **AppLinkURLScheme** salvo que también cambies el URL scheme en `Info.plist`.
- Esperar que Xcode resuelva `https://github.com/facebook/meta-wearables-dat-ios` fijado a versión **1.0.1**. Sus productos necesarios son `MWDATCore` y `MWDATCamera`. No se ha redistribuido ningún binario/archivo de Meta.
- Compilar; corregir cualquier diferencia de API o firma observada antes de afirmar que B0 funciona.
- Iniciar app → **1 Vincular con Meta AI** → regresar a Wivra → **2 Iniciar sesión** → cuando diga `started`, **3 Iniciar vista previa** → autorizar cámara (abre Meta AI) → volver a la app y observar contador/fotogramas.
- Si la app muestra que la cámara sigue en `waitingForDevice`, revisar que las gafas estén encendidas, enlazadas y próximas al iPhone. Si el SDK pide actualizar firmware o app en gafas, seguir los pasos oficiales.
- En la prueba B0, **la app se mantiene abierta en primer plano**. Si entra al fondo, detiene explícitamente la sesión. No afirmar streaming ininterrumpido con iPhone bloqueado.

**Si no tienes Mac con Xcode:** GitHub Actions puede compilar el proyecto para iPhone real **sin firma**, pero no instalarlo. La instalación en tu teléfono necesita firma de desarrollo y un Mac con Xcode o un método legítimo de distribución firmado. Nunca compartas contraseña Apple ID, certificados privados o claves de transmisión en un issue de GitHub. Prueba desde Meta AI en tu iPhone si el menú de desarrollador está disponible, mientras preparamos la firma.

**Alternativa para verificar que la instalación DAT funciona antes de depurar nuestro código:** clonar **el proyecto oficial** y ejecutar `samples/CameraAccess/CameraAccess.xcodeproj` (Meta es el titular del código, no incorporarlo al repo Wivra). Su app implementa conexión, previsualización, grabación local y MockDeviceKit; **no demuestra todavía RTMP**.

## Prueba de campo objetiva

| Ensayo | Condición | Evidencia a obtener |
| --- | --- | --- |
| 1 — Conectar | Registro Meta AI + sesión DAT | Registro autorizado y estado de sesión `started` |
| 2 — Primer fotograma | Perfil equilibrado `.medium/24` | Imagen real, frame count mayor que 0, fps observado y resolución efectiva |
| 3 — Estabilidad 5 min | iPhone a distancia habitual de gafas, app visible | Contador crece y fps sostenido, sin `thermalHot` ni pausas persistentes |
| 4 — Ahorro 5 min | Detener cámara, escoger `low/15`, reiniciar preview | Comparar fps, batería antes/después, sensaciones de calor y errores |
| 5 — Pausa / reanudar | Detener preview sin cerrar sesión, volver a iniciarlo | Nueva vista previa sin reiniciar Meta AI cuando los permisos siguen otorgados |
| 6 — Comportamiento seguro | Poner app en background/recibir interrupción | No afirmar que sigue grabando; UI y sesión regresan a estado seguro |

**Registro manual** que debe acompañar resultado: modelo exacto de gafas, firmware, versión iOS/Meta AI, porcentaje de batería inicial/final, temperatura ambiental aproximada, duración, resolución/FPS observados, errores mostrados y capturas de pantalla. Si la batería se calienta, dejarla descansar según recomendaciones del fabricante; no experimentar hasta apagado térmico.

### Estados de compilación (distintos de gafas conectadas)

- ✅ Compilación **iOS Simulator**: validada por GitHub Actions, run [38459815766](https://github.com/Os-WHGo/Wivra/actions/runs/38459815766).
- ⏳ Compilación **generic iOS device, sin firma**: comprobación de CI agregada; revisar su ejecución, sin asumir éxito antes del resultado.
- ⏳ Firma de desarrollo e instalación en iPhone: requiere acción del propietario y credenciales solo en su equipo.
- ⏳ Prueba real de datos desde Ray-Ban Meta: pendiente.

### Criterio de éxito B0

Se considera aprobado **únicamente** si, en iPhone físico conectado por el DAT, la UI muestra **video que proviene de las Ray-Ban Meta** y recibe frames sucesivos, con una prueba de al menos 5 minutos sin fallas críticas. No basta con CI verde, proyecto Swift sin compilar, simulador, foto fija, video local o acceso a Meta AI.

### Puerta posterior B1 → B2

- **B1: video local con sonido**, cambiar fuente DAT a `.hvc1`, verificar `CMSampleBuffer` timestamps/keyframes con AVAssetWriter y audio Bluetooth HFP o iPhone según permisos, **archivo reproducible** y link al asset del editor.
- **B2: un LIVE de 5 min por RTMPS real**, HEVC decode→ H.264/AAC, bitrate adaptativo, reconexión a Internet independiente del enlace DAT y archivo local A/V. Sólo tras pruebas reales activar multistream o agregar GoPro.
- El móvil debe mantenerse fresco y la batería de gafas debe medirse. **No prometer 8h de LIVE**, esa cifra Gen 2 corresponde a uso mixto.
- **El acceso a grabaciones YA guardadas en la memoria de las gafas no queda solucionado por B0/B1**; usar importación oficial vía Meta AI/Photos hasta que fabricante permita acceso.

## Derechos y seguridad

Código Swift en este directorio escrito para Wivra, sin copiar el sample del fabricante. El SDK de Meta se descarga por SPM y rige por [Meta Wearables Developer Terms](https://wearables.developer.meta.com/terms), no por la futura licencia MIT/Apache del proyecto. Las capturas de video y audio deben tener permisos y un indicador visible al público. Nada se transmite a servidores en B0.

Documentación consultada: [DAT iOS oficial](https://github.com/facebook/meta-wearables-dat-ios), [guía camera streaming](https://github.com/facebook/meta-wearables-dat-ios/blob/main/plugins/mwdat-ios/skills/camera-streaming/SKILL.md), [CameraAccess README](https://github.com/facebook/meta-wearables-dat-ios/blob/main/samples/CameraAccess/README.md).

— ChatGPT
