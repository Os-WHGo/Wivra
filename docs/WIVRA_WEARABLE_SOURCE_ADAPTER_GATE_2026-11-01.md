# Wivra · fuentes audiovisuales multimarca y puertas de capacidad (2026-11-01)

**Estado**: contrato de fuentes comprobable en `core/source-capabilities.mjs`; **NO** SDKs o gafas externas conectadas, ni multicámara física habilitada. Esta guía complementa, sin duplicar, el [informe #137](https://github.com/Os-WHGo/Wivra/issues/137), la biblioteca MU y los PR #136, #138, #139 y #140. Primera meta: beta Meta Gen 2 antes del 19-11-2026.

## Un solo producto, una sola línea audiovisual

La cámara Meta DAT, la cámara del teléfono, una aplicación/pantalla autorizada, un video propio y las gafas de terceros deben quedar descritos mediante una **fuente** que ofrece determinados **modos de salida**:

- `local-frames`: entrega muestras de video al compositor móvil. Imprescindible para PiP, split o cuadrícula *en tiempo real*.
- `direct-stream`: el dispositivo transmite a un destino autorizado (RTMP/RTMPS/SRT/WHIP según fabricante); **no** implica que entregue muestras al compositor de Wivra ni archivo MP4 local.
- `recorded-media`: un archivo original terminado, comprobado y permitido por su propietario; apto para Director/editor, pero no equivale a una cámara simultánea.
- `on-device-bridge`: app complementaria en las gafas o transporte a negociar; NO se considera soporte de cámara hasta que el bridge produzca datos verificables.

Cada capacidad (`cameraFrames`, `recordVideo`, `directLive`, `mediaImport`, `audioFrames`, `displayHud`, `screenFrames`, `concurrentVideo`) es `unknown/unavailable/experimental/ready`. **Nunca** asignar `ready` desde ficha comercial, SDK descargable o registro de dispositivo. Requiere sesión/permisos reales y evidencia específica:

1. Cámara: muestras nuevas con marcas de tiempo, dimensiones, FPS observado y antigüedad de señal; no un indicador REC o un preview congelado.
2. Grabación: archivo reproducible, duración real, integridad, decisión del usuario y manifest local. Sin éxito de MP4, no anunciar «guardado».
3. LIVE directo: confirmación del destino y consentimiento; iniciar un socket o ver un contador local no es emisión verificada.
4. Multicámara: dos fuentes `local-frames` simultáneas + prueba de compositor. Un dispositivo que solo emite RTMP no habilita PiP.
5. HUD/Display: render observado y permiso específico, sin inferir cámara por presencia de pantalla. Al cambiar sesión, las capacidades listas caducan.

## Radar de dispositivos, no lista de compatibilidad certificada

| Familia | Transporte/posibilidad de SDK a verificar | Principal bloqueo |
| --- | --- | --- |
| **Ray-Ban Meta Gen 2** | DAT iOS/Android existente, HEVC recibido | P0: MP4 largo, LIVE y modo bolsillo reales |
| **Meta Gen 3 / Display / Oakley** | DAT y Display por capacidades, nunca asumir 3K DAT ni pantalla en Gen 2 | SDK/firmware/permisos y QA por modelo |
| **Mentra Live** | Bluetooth SDK, salida LIVE a endpoint; comprobar acceso a frames locales | Que RTMP/SRT/WHIP directo NO sustituye frames para PiP |
| **HTC VIVE Eagle** | SDK iOS/Android cámara/video anunciado | Identificación, contrato de uso, frames en app, hardware |
| **Rokid** | CXR-L móvil vs CXR-M P2P privado vs on-glasses | Streaming continuo CXR-L no demostrado, acceso CXR-M |
| **RayNeo X3 Pro** | ARDK Android on-glasses, bridge opcional | Sin bridge iOS/Android Wivra real |
| **Android XR proyectado** | Jetpack ProjectedContext/CameraX preview | SDK en transición, hardware proyectado, permisos |
| **Snap Spectacles** | Lens Studio CameraModule on-device | Requiere Lens + bridge autorizado, no SDK cámara Swift |
| **Vuzix M400/M4000** | Camera2 Android on-glasses | CPU/batería/política de app, enfoque industrial |
| **Solos AirGo V2** | SDK video/Wi-Fi anunciado | Acceso/licencia; kit comercial NO autorizado |
| **Brilliant Halo/Frame** | cámara VGA/firmware mixto | Rendimiento y transportes no equiparables a video deportivo |
| **XREAL/otras audio-only** | visor/entrada, cámara POV NO demostrada | No declarar `cameraFrames` por tener HUD |
| **Xiaomi/Quark/Apple no anunciadas** | sin API pública de frames continuos verificada | Esperar SDK oficial y pruebas |

Investigación y enlaces primarios completos: [informe #137, entrada multimarca del 1-11](https://github.com/Os-WHGo/Wivra/issues/137#issuecomment-6564086694). **Sin código copiado** de terceros.

## Licencias y decisión de integración

MentraOS y Starter Kit: Apache 2.0, pero validar versión y licencia del binario SDK realmente enlazado. `xg.glass` (HKUST): Apache 2.0, su tabla aún no confirma streaming de video Meta/Rokid; **no reemplazar DAT**. Avenkin/OpenGlasses: BSL 1.1 con restricciones comerciales, **no incorporar su código** a la Wivra monetizable. HTC, Rokid, Snap, RayNeo, Solos y firmware de Halo requieren licencia y condiciones específicas. No introducir dependencias, claves, descarga de modelos IA, pagos ni alteraciones de firmas solo por un anuncio.

## Secuencia realista

**P0**: conservar adaptadores nativos Meta y rutas REC/LIVE/editor de Wivra; enlazar observaciones reales DAT al contrato `core/source-capabilities.mjs` cuando haya puente de datos probado. No cambiar el HTML compilado del editor de Claude sin repetir pruebas integradas. Validar iPhone físico con Gen 2, grabaciones largas, COPIA FINAL única y espacio libre.

**P1**: selector sencillo **Fuente → Diseño → Grabar/LIVE**, solo habilitar una fuente cuyo modo esté verificado; reutilizar clips y overlays existentes del editor. Experimento 2 fuentes: iOS `AVCaptureMultiCamSession` y Android `CameraX ConcurrentCamera`, más coexistencia DAT y compositor; no habilitar sin prueba de hardware `isMultiCamSupported`/feature concurrente. Android pantalla: MediaProjection por consentimiento; iOS: ScreenCaptureKit en sistemas compatibles y ReplayKit en versiones anteriores, con limitaciones de DRM/audio.

**P2**: Mentra Live primero como adaptador exploratorio sin inventar recepción local de frames, luego HTC/Rokid según licencias; bridge on-glasses para RayNeo/Snap/Vuzix si hay equipos y permisos. No bloquear Gen 2 por esta fase. Tres fuentes o más únicamente tras validar sincronía, presión térmica, latencia y hardware.

Referencias técnicas oficiales: [AVCaptureMultiCamSession](https://developer.apple.com/documentation/avfoundation/avcapturemulticamsession), [CameraX ConcurrentCamera](https://developer.android.com/reference/androidx/camera/core/ConcurrentCamera), [MediaProjection](https://developer.android.com/media/grow/media-projection), [ReplayKit](https://developer.apple.com/documentation/replaykit), [Android XR ProjectedContext](https://developer.android.com/develop/xr/jetpack-xr-sdk/access-hardware-projected-context).

**Sin pruebas físicas de multicámara/gafas ajenas a Gen 2**. Esta implementación es únicamente el contrato de capacidades y las barreras de seguridad, no adaptadores activos ni pantallas nuevas.
