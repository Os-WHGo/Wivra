# Wivra / AgentCut · contrato de cámaras universales + revisión de licencias
**13 octubre 2026 · Investigación y primer código — ChatGPT**  
**PR base:** streaming Meta [#35](https://github.com/Os-WHGo/agentcut/pull/35). Claude continúa editor multi-clip [#38](https://github.com/Os-WHGo/agentcut/pull/38) con Director [#39](https://github.com/Os-WHGo/agentcut/pull/39) y pruebas de agente integrado [#40](https://github.com/Os-WHGo/agentcut/pull/40). **No fusionar main ni renombrar repositorio.** Wivra es nombre en discusión y exige comprobación de marca antes de lanzamiento.

## La NUEVA definición de producto por el propietario

**UNA app con editor MANUAL completo más capas opcionales:**
1. **Editor manual** siempre usable sin IA: importar archivos, timeline multiclip, trim/split/move, capas, volumen/audio, textos, subtítulos si la persona los añade, transiciones, reencuadre/360, historial de deshacer, exportación realmente reproducible. No poner funcionalidades inexistentes como completadas.
2. **Agente de IA dentro de la app**, no prompt/JSON externo: por voz o texto, entiende el contenido, referencias por archivo y correcciones, propone/ejecuta herramientas del editor con validación, vista previa y rollback. ASR/VLM/TTS/OCR/captions deben funcionar de verdad antes de etiquetarse completos.
3. **Director creativo**: «quiero grabar sobre este lugar» → plan/guion, puntos sugeridos basados en ubicación consentida/verificada cuando se piden lugares reales; planos en checklist, marcados grabados, enlazados a medios del mismo proyecto; luego edición automatizable.
4. **Captura, importación y LIVE multisource**: iPhone, Ray-Ban Meta Gen2 y otros equipos Meta soportados, GoPro, Insta360 360/Action, RICOH Theta, DJI Osmo y cámaras estándar **solo según capacidad real**. Importación existente y video en directo son **capacidades diferentes**: no afirmes que tener Bluetooth/Wi-Fi equivale a API de videos o RTMP. La fuente debe normalizarse a `sourceId / assetId / PTS/audio / codec / panorama / permisos / sourceCapabilities` y alimentar el MISMO editor.
5. **IRL eficiente**: cámara→teléfono y teléfono→Internet son enlaces distintos; el remoto puede caer mientras el original se conserva si la cámara sigue entregando frames. Ray-Ban principal Bluetooth Classic DAT y perfil de 504×896/24 FPS HEVC como ensayo; no hay autonomía medida ni garantías térmicas. Relay opcional solo después de primer LIVE a un destino.

## Hallazgos concretos de compatibilidad por familia (fuentes primarias)

| Origen | Revisar/descargar material existente | Vista previa / capturar LIVE | API, limitaciones |
| --- | --- | --- | --- |
| **Meta Ray-Ban y Oakley compatibles** | **NO CONFIRMADO en DAT 1.0 un SDK público que liste/transfiera archivos grabados nativamente en la memoria de las gafas.** Meta [discussión #28](https://github.com/facebook/meta-wearables-dat-ios/discussions/28) señala esa limitación y el equipo dijo que lo consideran a futuro. Importar vídeo desde **Fotos/Archivos tras exportación con Meta AI** sí. Alternativamente Wivra puede **grabar localmente el LIVE DAT** para importación inmediata, que NO es el video nativo 3K ya almacenado en gafas. | DAT iOS/Android `Camera.stream`, HEVC; pasar por decoder/encoder y publisher autorizado. | [DAT iOS CameraAccess](https://github.com/facebook/meta-wearables-dat-ios/tree/main/samples/CameraAccess). SDK bajo condiciones Meta, no MIT. No invertir/raspar interfaz privada de Meta AI para desbloquear medios existentes. |
| **GoPro HERO/MAX compatibles** | [Open GoPro](https://gopro.github.io/OpenGoPro/) permite listar/transferir SD via HTTP por Wi‑Fi/USB para modelos que lo soporten. | Preview UDP MPEG-TS por Wi-Fi/USB; modo LIVE RTMP(S) de GoPro por Wi-Fi station. Diferenciar emisor GoPro directo a plataforma vs video que llega primero a Wivra para mezclar y guardar. | [Diferencias stream](https://gopro.github.io/OpenGoPro/docs/faq/), [stream a RTMP(S)](https://gopro.github.io/OpenGoPro/docs/ble/live_streaming/). Compatibilidad por modelo/firmware. Su nueva [GoPro Connect SDK](https://github.com/gopro/camera-kotlin-sdk) usa SDK **cerrado/comercial** y repo solo documentación; no confundir con Open GoPro. |
| **Insta360 X/ACE/GO y 360** | SDK Cámara permite listar media en cámara, descargar y Media SDK export/stitching, pero requiere [solicitar acceso](https://onlinemanual.insta360.com/developer/en-us/resource/sdk) y aceptar términos. | [SDK Camera Android](https://insta360develop.github.io/Insta360-Developer_Docs/en/x/android/camera-integration/) da preview, control, rutas Wi‑Fi/USB/BLE; algunos permiten livestream panorámico, no asumir en cada modelo. | Files .insv/.insp y metadatos gyro/360 pueden requerir stitching y dewarp con biblioteca autorizada, conservando originales. |
| **RICOH THETA** | [THETA OSC API](https://docs-theta-api.ricoh360.com/web-api/) lista y descarga media. | [getLivePreview](https://docs-theta-api.ricoh360.com/web-api/commands/getLivePreview.html) es Motion-JPEG; no significa RTMP con audio por defecto. | [ricohapi/theta-client](https://github.com/ricohapi/theta-client) MIT como opción de cliente para API, comprobar modelo. |
| **DJI Osmo Action / otras** | Importación manual desde Files/Photos siempre que el OS dé acceso. | La vista en app oficial DJI Mimo NO prueba que Osmo Action tenga un SDK público abierto para conectarse a Wivra. | No confundir [DJI Mobile SDK Live](https://developer.dji.com/doc/mobile-sdk-tutorial/en/tutorials/live-stream.html) para equipos cubiertos por su SDK con soporte garantizado de Osmo Action. Requiere investigación específica. |
| **USB/UVC/RTSP/RTMP y cámaras genéricas** | Permitir selección archivos originales con permisos; formatos MOV/MP4/HEVC, GoPro 360 y .insv por adapters. | Solo si protocolo y permisos de iOS/Android para ese hardware lo permiten y hay decoder/encoder; Wi‑Fi/Bluetooth que conecta no implica video accesible. | Protocolos **no son universalmente intercambiables**, control BLE generalmente no lleva fotogramas HD; buscar bridges oficiales, no hacks de claves. |

**Decisión de construcción para ChatGPT**: Ray-Ban Meta primero **B0→B2** (preview, archivo local A/V, RTMPS a un destino en teléfono real); GoPro Open GoPro primero entre cámaras externas por la documentación pública, control y medios. En paralelo, **contrato universal seguro** para las demás, sin afirmar soporte real no implementado. No sacrificar el editor manual ni la exportación por agregar logos de cámaras.

## Código de interoperabilidad creado en ESTE PR

- `streaming/camera-source-registry.mjs`: familias registradas + acciones independientes `manual_file_import`, `browse_remote_media`, `download_remote_media`, `camera_preview`, `broadcast_live`, `record_remote`, `local_record_from_preview`, `control_camera`. Contrasta **API documentada** con **capacidad verificada en dispositivo** y consentimiento. Requiere `nativeProbe` suministrado por integración nativa real con `model/firmware` específico. Si no está comprobado => no disponible; no programa sockets/transferencias ni permite control del modelo a ciegas.
- `importPolicy()`: conservar original, distinguir contenido 360/equirrectangular, no aplicar transcodificación destructiva ni perder datos giroscópicos/metadata. No afirma abrir archivos RAW propietarios.
- `streaming/tests/camera-source-registry.test.mjs`: rechaza falsas afirmaciones de acceso a archivos Meta, false LIVE de DJI, falsa equivalencia preview THETA MJPEG↔LIVE RTMP, falta de consentimiento/Internet. Test de lógica Node, **sin hardware físico**.

## Licencias: estado REAL de nuestro GitHub (13-10-2026)

**Verificación directa:** `Os-WHGo/agentcut` es actualmente público; su rama **`main` no tiene archivo `LICENSE`**. Claude abrió el borrador [PR #36](https://github.com/Os-WHGo/agentcut/pull/36) con texto **MIT License © 2026 AgentCut contributors** y README; aún sin merge. Su PR menciona que el propietario seleccionó MIT, pero la conversación actual expresa dudas. **No decidir ni fusionar licencia mientras el propietario reconfirma.** MIT solo licenciaría el código cuyos titulares pueden ofrecer esa licencia; no convierte SDKs ajenos en MIT ni da permisos sobre modelos/pesos/música/patentes/marcas.

**Mi recomendación provisional: MIT para código ORIGINAL de Wivra** (simple y permisiva, útil para reutilizar componentes compatibles, publicar demos y posibles integraciones comerciales). **Apache-2.0** también es permisiva y agrega licencia de patentes explícita y obligaciones de NOTICE; elegirla si la protección de patentes y contribuciones pesa más que simplicidad. Ambas requieren conservar licencias ajenas. **Ninguna licencia propia permite copiar cualquier repositorio de GitHub**. [GitHub license docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository), [MIT OSI](https://opensource.org/license/mit), [Apache 2.0 oficial](https://www.apache.org/licenses/LICENSE-2.0.html).

**Matriz revisada (licencia informada por GitHub o archivo fuente, no necesariamente binarios/weights):**

| Software / SDK | Licencia o política | Acción antes de usar |
| --- | --- | --- |
| OpenCut, WebAV, Whisper.cpp, Silero VAD, ricohapi/theta-client, MediaMTX | MIT (metadata en GitHub) | Puede ser candidato sin obligar a licenciar Wivra como copyleft; preservar avisos y revisar dependencias. |
| HaishinKit.swift | BSD-3-Clause | Preservar avisos de copyright, condiciones y no usar nombres de autores para promoción. |
| RootEncoder y Tesseract.js | Apache-2.0 | Preservar licencia/avisos NOTICE aplicables, modificaciones, patentes. |
| Mediabunny | MPL-2.0 | Copyleft **a nivel de archivo** sobre archivos MPL modificados; mantener avisos/fuentes de esos archivos en distribuciones. Revisar la integración. |
| FFmpeg | LGPL-2.1+ por defecto, con módulos opcionales GPL o incluso no redistribuibles en algunas configuraciones | Auditoría de build, codecs, enlazado y patentes. [FAQ FFmpeg legal](https://ffmpeg.org/legal.html), **nunca** asumir que un wrapper MIT convierte el motor FFmpeg en MIT. |
| Concat (`jub0t/concat`) y algunas bibliotecas de IA/visión | AGPL-3.0 o GPL | **No incorporar/forkear código al núcleo MIT sin evaluación legal**: existe copyleft que puede extenderse a una obra combinada y AGPL también regula modificaciones usadas como servicio de red. Leer [AGPL](https://choosealicense.com/licenses/agpl-3.0/). Consultar abogado si se evalúan combinaciones, procesos separados o servicios externos. |
| Meta Wearables DAT | **Meta Wearables Developer Terms + Acceptable Use**, no MIT. [Licencia repo](https://github.com/facebook/meta-wearables-dat-ios/blob/main/LICENSE) | Aceptar SDK/registro/capacidades/reglas; no copiar su sample como si fuera MIT. |
| Insta360 Camera/Media SDK | Acceso por aprobación y condiciones del fabricante | Confirmar contrato redistribución y SDK específico antes de bundlear. Documentación pública ≠ código permitido. |
| GoPro Open GoPro | GoPro declara API/documentación de uso abierto bajo MIT, pero **el archivo `LICENSE` raíz del repo no es texto MIT completo** y remite a licencias de componentes terceros. | Auditar licencia por cada sample/archivo y firmware; [programa GoPro](https://gopro.com/en/cm/info/open-gopro). |
| GoPro Connect SDK (nuevo) | **Cerrado/comercial**; repo GitHub de documentación con licencia restringida | No importar binarias ni código como si fueran open-source. [README](https://github.com/gopro/camera-kotlin-sdk), [LICENSE](https://github.com/gopro/camera-kotlin-sdk/blob/main/LICENSE). |
| SDK 360 GoPro Media Swift | No licencia OSS declarada `NOASSERTION` en metadatos GitHub | Confirmar licencia de binarios XCFramework, derechos comerciales y requisitos. |

**Distinguir cinco capas jurídicas:** (i) LICENSE **de nuestro código propio**, (ii) licencia de cada dependencia incluida, (iii) términos/API del fabricante/cuentas, (iv) licencias de **modelos + pesos + datasets**, (v) derechos de música/voz/imagenes/códecs y marcas (Wivra). Mantener inventario **SBOM** + `THIRD_PARTY_NOTICES`, versiones, modelo/pesos y origen legal; revisar nuevo paquete antes de la distribución iOS/Android y tras actualizaciones. No afirmar revisión legal definitiva: este documento es inventario técnico, solicitar revisión especializada antes de lanzar.

## Interfaces y alcance de producto para Claude

El editor **manual** es la base y sigue siendo gratis/usable sin modelo. ChatGPT desarrolla dispositivos/streaming, Claude se concentra en timeline/exportación/voz y herramientas AI. La convergencia NO es implementar cinco editores: todas las fuentes producen:

```text
CameraDeviceAdapter (meta | gopro | insta360 | theta | phone | generic)
    discover → permissions → verified capabilities/model/firmware
    ├─ remote media files → authorized import → immutable local MediaAsset
    └─ live camera frames + audio → local recorder AND outgoing encoder → verified MediaAsset
                                     │
                same single Wivra editor/timeline/project
                         manual ⇄ voice/AI tool calls
                                     │
                        captions, script, TTS, effects, export
```

El paquete mínimo por archivo debería tener `assetId, sourceFamily, model? (solo si consentido), origin (local/remote/native), codec, duration, dimensions, fps, audioTracks, sync/timebase, panoProjection, orientation, chapter/shotId, privacy flags`; jamás pasar credenciales Wi-Fi ni claves stream en JSON de proyecto.

**Riesgos a medir:** acceso API del fabricante, transferencia de originales (3K/5.3K/360), enlace de video de previsualización NO calidad original, audio y sync, dos Wi-Fi incompatibles, RTMP(s) vs RTSP/UDP, batería/calor de gafas y móvil, background en iOS, desconexiones celulares, garantía y costo de nube/relay. Importación de clips 360 exige dewarp/stitching con motor/licencias antes de decir «editable».

**Siguiente paso exacto de ChatGPT:** probar Meta DAT nativo con gafas primero, e implementar adaptador GoPro Open GoPro independiente de cómo se renderiza la línea de tiempo; pruebas por cámara/firma. El núcleo actual es contrato y tests, **no cámara conectada realmente**. Conservar `main` sin merge.

— ChatGPT
