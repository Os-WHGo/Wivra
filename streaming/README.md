# AgentCut · Meta Ray-Ban → iPhone → LIVE + archivo local (spike técnico)
**2026-10-13 · — ChatGPT**  
**Estado del trabajo:** investigación verificada de SDK/código fuente + controlador de seguridad probado con Node + receptor **Swift de integración sin compilar**. **NO existe todavía un stream LIVE comprobado ni una app instalada.** PR independiente del trabajo de Claude en el editor; no fusionar `main` sin el propietario.

## Encargo y fronteras entre equipos

Claude continúa editor/IA: archivos → observar/escuchar → seleccionar → editar → exportar ([PR #29](https://github.com/Os-WHGo/agentcut/pull/29), [#30](https://github.com/Os-WHGo/agentcut/pull/30), [#32](https://github.com/Os-WHGo/agentcut/pull/32)). ChatGPT investiga e implementa el **puente nativo para LIVE con Ray-Ban Meta**, con prioridad iPhone, luego Android. Ambos se encontrarán mediante un contrato de fuente multimedia + `assetId`/timecodes, **no** mediante dos editores distintos.

Producto para usuario **100% desde teléfono** una vez instalado; para construir/firma iOS *sí* requiere macOS/Xcode o servicio de compilación remota y credenciales de desarrollo según método de distribución. No prometer que un navegador Safari recibe la cámara DAT directamente.

**Flujo de éxito deseado:**

```text
Ray-Ban Meta (stream solicitado HEVC .hvc1, 504x896/24 fps)
           │
       DAT 1.0 SDK nativo iOS
           │ frames CMSampleBuffer con timecodes
           ├────────► pista video HEVC AVAssetWriter passthrough .mov
           │          + pista audio AAC autorizada y sincronizada
           │          → archivo local verificado → AgentCut assetId
           │
           └────────► decodificar HEVC con VideoToolbox
                      → codificar H.264 hardware / AAC
                      → RTMPS oficial (un destino de prueba)
                      → YouTube/Twitch/Kick/Facebook/etc. SEGÚN acceso
```

La **vista previa**, **registro local** y **transmisión** son tres acciones/estados diferentes. Obtener frames de gafas NO equivale a haber transmitido; obtener enlace RTMP NO equivale a haber guardado un archivo. Un archivador no debe declarar «guardado» hasta escribir, cerrar y **verificar** el video reproducible con audio/tiempos.

## Corrección importante del propietario: Wi-Fi integrado en las gafas

**Verificado en fuentes primarias, 2026-10-13:** las gafas sí tienen Wi-Fi propio, y Meta incorporó **`[Feature] WiFi transport` en DAT iOS 0.8.0 (25-06-2026)**; los SDKs posteriores 1.0 mantienen esta rama de conectividad. Es diferente de que Meta AI pueda transferir grabaciones existentes por Wi-Fi. El SDK **también puede recibir imágenes en directo por ese enlace**, con mayor ancho de banda potencial.

- [Meta iOS CHANGELOG 0.8.0](https://github.com/facebook/meta-wearables-dat-ios/blob/main/CHANGELOG.md)
- [Meta iOS AGENTS.md](https://github.com/facebook/meta-wearables-dat-ios/blob/main/AGENTS.md) exige claves de `Info.plist` para Wi-Fi: `NSLocalNetworkUsageDescription` y `NSBonjourServices` con `_bonjour._tcp`; también documenta el enlace Bluetooth Classic (`UISupportedExternalAccessoryProtocols`, `external-accessory`).
- [Flutter bridge](https://github.com/rodcone/flutter_meta_wearables_dat#choose-your-camera-transport-wi-fi-recommended-or-bluetooth-classic) documenta que en **esa integración iOS** la elección Wi-Fi vs Bluetooth se hace con `Info.plist` y *entitlements*, sin conmutador en caliente. Requiere capacidades de Wi-Fi/hotspot e inscripción/firma Apple adecuada, a verificar con Meta 1.0 y compilación real, no asumir que una cuenta Apple gratuita permite todo.
- [Issue Meta #233](https://github.com/facebook/meta-wearables-dat-ios/issues/233), cerrado julio 2026 como mejora conocida: con Wi-Fi la app se une al **softAP** de las gafas, desplazando el Wi-Fi de internet normal del iPhone. El acceso internet exterior pasa por **datos celulares**. En un comentario del **2 de julio 2026**, un representante de Meta recomendó **Bluetooth Classic para live que se publica a internet**, ya que el modo Wi-Fi disponible entonces no resolvía el uplink Wi-Fi de infraestructura.
- La conversación de [release DAT 0.8 #226](https://github.com/facebook/meta-wearables-dat-ios/discussions/226) reportó 720×1280 a 30 FPS con Wi-Fi en un Gen 2, pero **con errores de decodificación HEVC y bloqueos** en esa versión/firmware. Es experiencia de desarrolladores de junio/julio, no prueba de rendimiento en 1.0.1.

**No confundir**:
1. **Wi-Fi para importar media grabada** desde gafas a Meta AI: no es en sí una API oficial para que AgentCut enumere el almacenamiento del dispositivo.
2. **Wi-Fi de DAT para cámara en directo**: disponible desde 0.8 en SDK, pero requiere permisos de red, soporte de firmware y prueba de enlace.
3. **Salida de AgentCut hacia Twitch/YouTube/Kick**: una **segunda conexión a internet**, que debe funcionar *al mismo tiempo* que la entrada de la cámara. Con Wi-Fi softAP puede depender de celular; con Bluetooth Classic puede aprovechar Wi-Fi normal del teléfono o celular.

**Decisión experimental para IRL:** mantener **Bluetooth Classic como primer ensayo B0→B2**, por la recomendación de Meta y menor interrupción de la ruta normal de internet, aunque reduzca la resolución. Probar **Wi-Fi softAP como alternativa B2W** en un segundo build de iOS firmado adecuadamente, priorizando una señal 720p recibida en el teléfono y el funcionamiento simultáneo del uplink **celular**. No cambiar de enlace automáticamente sin API documentada. Medir duración conexión, estabilidad, corrupción de HEVC, FPS reales, temperatura, batería, latencia, uso de datos y factibilidad de retransmitir durante 5 minutos. El objetivo no es 4K ficticio sino video usable.

**Código actualizado:** `streaming/live-preflight.mjs` declara explícitamente `cameraLink` (`bluetooth-classic`/`wifi-softap`), `phoneUplink` (`cellular`/`existing-wifi`/`unknown`) y advierte combinación Wi-Fi softAP + uplink Wi-Fi normal. Es **solo planificación**, no cambio físico de transporte. Los tests distinguen ambas rutas.

## Novedad relevante de Meta DAT 1.0 (verificada leyendo fuente oficial)

Fuentes primarias consultadas 2026-10-13:
- SDK iOS y [CameraAccess oficial](https://github.com/facebook/meta-wearables-dat-ios/tree/main/samples/CameraAccess)
- [Meta camera-streaming skill de documentación](https://github.com/facebook/meta-wearables-dat-ios/blob/main/plugins/mwdat-ios/skills/camera-streaming/SKILL.md)
- [Audio streaming skill](https://github.com/facebook/meta-wearables-dat-ios/blob/main/plugins/mwdat-ios/skills/audio-streaming/SKILL.md)
- [CHANGELOG](https://github.com/facebook/meta-wearables-dat-ios/blob/main/CHANGELOG.md)
- [DAT Android CameraAccess](https://github.com/facebook/meta-wearables-dat-android/tree/main/samples/CameraAccess) y [skill Android](https://github.com/facebook/meta-wearables-dat-android/blob/main/plugins/mwdat-android/skills/camera-streaming/SKILL.md)
- [FAQ Meta](https://developers.meta.com/wearables/faq/)

**Cambios de API que hacen obsoletos muchos tutoriales**:
- **1.0.0 lanzado 2026-09-24; 1.0.1 lanzado 2026-10-09**. SDK estable 1.0, con funciones experimentales diferenciadas. Su documentación pública README de GitHub conserva algunas frases antiguas sobre *developer preview*, dar preferencia a FAQ y CHANGELOG.
- **iOS:** `Wearables.shared`, `createSession(deviceSelector:)`, `DeviceSession.start()` → esperar estado `.started` → **`session.addCamera(config:)`** → **`camera.stream.videoFramePublisher`** → `camera.stream.start()`. No usar API vieja `DeviceSession.addStream()`/`StreamSessionConfig`.
- `StreamConfiguration(videoCodec: .hvc1, resolution: .medium, frameRate: 24)` entrega **frames HEVC comprimidos** en `frame.sampleBuffer`, mientras `.raw` entrega frames decodificados. El ejemplo iOS 1.0 escribe `CMSampleBuffer` HEVC a `AVAssetWriterInput(...outputSettings:nil...)` con manejo de DTS/PTS y bandera keyframe.
- Configuración documentada: `low` **360×640**, `medium` **504×896**, `high` **720×1280**, FPS entre 2/7/15/24/30. Son solicitudes, no garantías: **Bluetooth Classic es el cuello de botella** y DAT reduce resolución/FPS dinámicamente según conexión. Por tanto las gafas NO ofrecen salida LIVE 4K DAT en estos modos. Reducir FPS/resolución puede mejorar la compresión por frame.
- El ejemplo oficial iOS captura **audio del micrófono de las gafas por Bluetooth HFP** hacia `AVAssetWriter` como AAC. Eso es distinto de **audio PCM por `Stream.audioFramePublisher`**, que Meta marca **experimental/no publicable en producción**. **Se debe probar si HFP entrega audio utilizable con RTMPS de manera estable**, no asumir que basta copiar el sample de grabación.
- El ejemplo iOS termina vista previa activa cuando la app pasa a segundo plano; restricciones por pantalla bloqueada, llamadas entrantes y caminatas largas **deben medirse**. No prometer background ilimitado.
- Android SDK 1.0 recibe stream tras `session.addCamera()`; `StreamConfiguration(compressVideo=true)` ofrece **HEVC comprimido**. En Android su ejemplo soporta grabar desde foreground service en background, a diferencia del comportamiento mostrado por el ejemplo iOS. iOS ≠ Android.
- Meta `MockDeviceKit` permite simular dispositivos/cámara antes de conectar gafas reales; las pruebas de compilación y runtime aún faltan.

## Auditoría de repositorios IRL/RTMP disponibles (no copiar binarios indiscriminadamente)

| Proyecto | Observación tras leer código/metadata | Licencia / condiciones |
| --- | --- | --- |
| [DAT iOS](https://github.com/facebook/meta-wearables-dat-ios) | **SDK oficial necesario**, `samples/CameraAccess` hace preview y archivo HEVC + audio HFP; no emite RTMP por sí solo | **Meta Wearables Developer Terms**, no licencia OSS |
| [DAT Android](https://github.com/facebook/meta-wearables-dat-android) | Ruta `compressVideo` para muestras HEVC, sample Android; útil al llegar a Android | **Meta Wearables Developer Terms** |
| [SpecBridge](https://github.com/sashimi0/specbridge) | Swift `StreamManager.swift` usa **viejo StreamSessionConfig**; `SpecBridge.swift` usa HaishinKit y tiene URL Twitch incrustada; referencia de arquitectura **obsoleta para DAT 1.0 sin migración** | MIT repo, código no probado por nosotros |
| [FrameFlow](https://github.com/KilimcininKorOglu/FrameFlow) | Android con ruta de gafas/RTMP documentada; usa DAT **0.2.x**; no garantiza SDK 1.0 ni pruebas reales | MIT repo |
| [HaishinKit.swift](https://github.com/HaishinKit/HaishinKit.swift) | Codificación/RTMP(S)/SRT en iOS; entrada de frames y API exacta por probar con SDK 1.0 | BSD-3-Clause |
| [RootEncoder](https://github.com/pedroSG94/RootEncoder) | Codificador RTMP/RTMPS/SRT Android; integración HEVC→H.264 de Meta por implementar | Apache-2.0 |
| [Moblin](https://github.com/eerimoq/moblin) | App IRL iOS abierta, útil como referencia de reconexión, bitrate y controles; no incluye por sí misma bridge DAT integrado en AgentCut | MIT repo |
| [MediaMTX](https://github.com/bluenviron/mediamtx) / [SRS](https://github.com/ossrs/srs) | Relay opcional para varios destinos a partir de un solo flujo móvil | MIT repos, pero servidor/transferencia pueden costar |

Las licencias indicadas son de repos (cuando hay metadatos); dependencias, condiciones de Meta y plataforma deben auditarse para distribución.

## Código creado EN ESTE PR

- `streaming/live-preflight.mjs`: contrato de **preflight** sin secretos, fuente/fps/resolución, destinos y requisitos de cuenta, estimación de datos y **máquina de estados**. Por diseño NO hace socket ni grabación, ni almacena claves. Los métodos requieren señales de conexión nativa, frame observado, codificador listo, pulsación humana y archivo realmente verificado. **Estas señales son parámetros que el futuro puente nativo debe autenticar**; un agente remoto nunca debe controlar `startLive`. Tests simulan condiciones, no prueban hardware.
- `streaming/ios/AgentCutDATReceiver.swift`: ejemplo Swift **original y no compilado** de apertura de `DeviceSession`, permiso explícito de cámara, `addCamera`, escucha de frames HEVC y limpieza. El `DATFrameSink` debe implementarse con **AVAssetWriter real + pipeline H.264/RTMPS**. Es documentación ejecutable futura, **no app funcionando**.
- `streaming/tests/live-preflight.test.mjs`: valida formatos DAT, gates de elegibilidad/destino/consentimiento, ahorro de subida por relay y estado `saved` condicionado a archivo real. GitHub Actions comprueba JS, **no compila Swift**.

## Próximas pruebas concretas: pequeña demo LIVE antes de multistream

**B0: acceso a dispositivo (iPhone)**  
En app iOS mínima (SwiftUI/Xcode), instalar DAT 1.0, registrar desde Meta AI app, permisos explicados, iniciar sesión, conectar gafas, mostrar preview durante **60 s** y guardar estadísticas: FPS, resolución de frames reales, fallos, batería y temperatura. Hacer primero MockDeviceKit y luego gafas reales; no copiar fuente del SDK al repo.

**B1: archivo local de verdad**  
Basándose en la **forma de manejo** de `VideoRecorder` oficial (no copiando Meta source), implementar HEVC sample passthrough a MOV + audio HFP o micrófono del teléfono si permitido, reparar DTS/PTS/keyframes, finalizar/reproducir clip local de 60 s. Guardar fuera de temp si se conservará, asignar `assetId` compartible con editor. Antes de pasar a B2 comprobar que el archivo reproduce video/audio en Fotos o reproductor local.

**B2: un LIVE real de 5 min**  
Usar HaishinKit + VideoToolbox para **decodificar HEVC de gafas, codificar H.264 + AAC y publicar vía RTMPS** en **un destino** (Twitch/YouTube/Kick según elegibilidad/cuenta). Durante LIVE **escribir archivo local sin segundo encoder de video HEVC si es posible**, desde el stream comprimido original. Comprobar sincronía audio, continuidad y reconexión. Capturar log de latencia y bytes. Si Audio HFP no funciona, mostrar error o modo sin audio; nunca indicar audio transmitido sin pista real.

**B3: durabilidad IRL**  
Probar paseo con red móvil irregular, interrupción de app, calor, cambios Bluetooth y pérdida de señal; **no prometer transmisión continua** hasta comprobar. Ofrecer stop manual y recuperación de archivo si cae RTMP. Analizar almacenamiento/códec, cambiar resolución si baja FPS.

**B4: destinos extra y relay (después)**  
Agregar adaptadores sin passwords en archivo: cuentas de Twitch/YouTube/Kick/Facebook cuando aceptan RTMPS; TikTok/Instagram **solo con acceso LIVE/encoder de cuenta**; opciones custom RTMPS autorizadas. Para multistream utilizar un envío a relay propio/terceros con costo transparente, no anunciar simultaneidad universal gratuita. Mantener `single` por defecto.

**B5: entrega al editor de Claude**  
La salida del puente es un media asset **local** más metadatos: `sourceId`, `localAssetId`, `recordStartUtc`, `durationMs`, `codec`, `actualWidth/Height/Fps`, `audioAvailable`, `marks`. No pasar credenciales RTMP ni metadatos privados sin consentimiento. Claude construye el agente que selecciona highlights en el archivo, sin necesidad de conocer a qué plataforma se emitió.

## Criterios de éxito verificables y cosas que NO se deben prometer

**Éxito real B2:** en iPhone con gafas físicamente enlazadas, emite LIVE a **un** destino 5 min, guarda archivo de video/audio reproducible localmente, recibe evidencia de bitrate/FPS/temperatura y el editor abre ese asset. Una grabación en el SDK sin RTMP real no cumple B2. Un stream RTMP sin archivo real tampoco.

**Falta hoy:** infraestructura de compilación, Apple firma e instalación, cuentas LIVE de prueba, hardware real, tolerancia de background, codecs H.264/HEVC pipeline, integración audio, exportación y compatibilidad efectiva del SDK/HaishinKit. **No implementado en esta rama**. La subida de contenido sale del teléfono hacia plataformas de streaming que el usuario autorice; no se convierte en “100% local” solo por utilizar SDK nativo.

**Coordinación:** Claude puede leer esta hoja para conectar la salida `localAssetId` al editor y mantener su desarrollo separado. ChatGPT continuará solo la rama Meta/LIVE; no modificar las ramas de Claude.

— ChatGPT
