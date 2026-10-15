# Wivra LIVE B2C · panel OBS / alertas / mensajes al oído

Estado: **controlador local + panel SwiftUI de DEMOSTRACIÓN**, no emisión real, no OAuth, no chats reales, no TTS audible, no codec ni mezclador conectado. Mantener estado de PR en borrador.

## Alcance entregado
- `community-bus.mjs`: normaliza **solo eventos verificados por adaptador**, deduplica por plataforma+evento, filtra roles e interacciones, configura prioridades, caducidad, máximo de mensajes, retardo y cooldown.
- Panel de lectura opt-in, en modo silencioso por defecto. Prioridades diferentes según `viewer/follower/subscriber/moderator/owner`, plataforma y clase de evento: chat, follow, subscription, gift, donation. `mode: quiet/balanced/all`.
- Contribuciones: umbrales explícitos en moneda **individual por plataforma**, sin convertir valores ni asumir tasa de cambio o decimales. Regalos de puntos no se confunden con dólares.
- Planifica por separado **TTS**, sonido de alerta y overlay. `monitor` privado vs `program` público; lo público requiere consentimiento expreso. **No se reproduce nada en este bloque**.
- Política `safeToSpeak` requerida al extraer de cola y bloqueo por defecto en la UI iPhone. El usuario no debe recibir lecturas distractoras mientras esquía si comprometen la seguridad; Wivra no detecta movimiento automáticamente.
- `planLiveAudioRoute`: solo valida IDs detectados y coteja la ruta observada con la elegida; distingue captura, monitor del sistema y audio de programa. El selector no puede forzar arbitrariamente AirPods o HFP; eso debe resolverlo AVAudioSession nativo con compatibilidad probada.
- `obs-control-planner.mjs`: panel declarativo, presets de canvas, escenas, efectos tipados `cut/fade/slide/zoom/blur/grayscale/caption/sticker`, destinos con estado explícito; no carga código de shaders arbitrarios ni scripts, no almacena URL ni claves RTMP. Una instrucción de efecto no equivale a fotogramas procesados.
- `WivraLiveCommunityPanel.swift`: sheet desde Scene Lab B2B, parámetros de simulación, marcas YouTube/Twitch/Kick/TikTok/RTMP, salida del sistema observada y alertas explícitamente FICTICIAS. No tiene conexión externa ni voz.
- Tests Node para límites de seguridad, cola, filtros, monedas, consentimiento, rutas, efectos, estados y UI. CI iOS prueba compilación (sin gafas reales).

## Plataformas (integración por ADAPTADORES)
| Servicio | Destino de video | Chat y eventos | Cautela |
| --- | --- | --- | --- |
| YouTube | RTMP(S) según configuración y requisitos del canal | LiveChatMessages.streamList, roles, Super Chat y Super Stickers | OAuth, cuotas y políticas |
| Twitch | RTMP(S) según configuración | EventSub `channel.chat.message`, `channel.cheer`, `channel.subscribe` | OAuth/scopes, WebSocket/webhook autorizados |
| Kick | RTMP(S) según configuración | API de eventos/webhooks `chat.message.sent`, suscripciones, regalos y `kicks.gifted` | Receptor público de webhooks y validación criptográfica |
| TikTok | Posible solo con habilitación de LIVE/ingest de esa cuenta | No hay conector general oficial validado aquí para chat/regalos | No afirmar que una librería inversa no oficial pueda usarse para producto comercial |
| Otros / RTMP personalizado | Configuración manual por servicio | Sin chat/alertas salvo adaptador oficial específico | Cada destino se valida y autoriza por separado |

No significa que los cinco destinos puedan emitirse simultáneamente hoy. Para muchos destinos se requerirá un **relay**/servidor de distribución o varias sesiones encoder con costos/limitaciones de red y CPU. Wivra no conserva claves en snapshots del panel. Revisar cuotas de ingesta, políticas de multistream y derechos antes del despliegue.

## Repositorios candidatos (NINGUNO INSTALADO)
1. `HaishinKit/HaishinKit.swift` (BSD-3-Clause): RTMP(S)/SRT, base Apple para encoder/compositor; revisar dependencias y licencias transitivas, versión fija y API exacta con prueba de DAT.
2. `obsproject/obs-websocket` (GPL-2.0): usar protocolo y patrones de control como **referencia**, no copiar código licenciado ni asumir OBS Studio disponible dentro de iPhone.
3. `steveseguin/social_stream` (GPL-3.0): referencia de UI y chat multistream; NO integrar browser extensions ni código sin estudio de licencia y privacidad.
4. Documentación oficial Twitch EventSub, YouTube Streaming Chat y Kick Dev API para adaptadores propios.

Las herramientas no se instalan por leer esta nota. Cualquier dependencia nueva exige escanear paquete, dependencias y scripts, contrastar licencia, fijar commit/versión, revisar conexiones de red y prueba en sandbox.

## Próximos bloques IMPLEMENTABLES
A. Conectar las opciones del panel SwiftUI con un `CommunityCoordinator` nativo, y usar `AVSpeechSynthesizer` SOLO con opt-in, cola filtrada y ruta de salida efectivamente verificada por iOS. Probar desconexión de AirPods/HFP, concurrencia de grabación y notificaciones de llamada. Nunca reproducir TTS al aire por defecto.
B. Implementar adaptador de una plataforma por vez: primero YouTube/Twitch, después Kick con webhook seguro. Auth OAuth/Keychain y servidor receptor si API lo exige. Solo clasificar roles/regalos reportados por API, no inventarlos.
C. Compositor AVFoundation/Metal con fuente RAW DAT y CG, frames/PTS, transiciones/effects reales; evaluar HaishinKit para publisher una vez pasado análisis legal/seguridad y pruebas de rendimiento.
D. Encoder/publisher con ACK auténtico, gestión de fallos y recuperación, grabación local opcional y medidores de calidad/temperatura. Multistream solo después de medir ancho de banda y compatibilidad con cada cuenta.
E. Pruebas en dispositivo: permisos, vista previa gafas, audio entrada real, salida monitoreo/auricular, límite de calor/batería, pérdida de red, segundo plano/pantalla bloqueada y contenido/moderación.

**Advertencia iOS importante**: No dar por sentado que la transmisión desde gafas seguirá funcionando con iPhone bloqueado, pantalla apagada o aplicación en segundo plano. El ciclo de vida del SDK y las restricciones del sistema deben validarse en pruebas reales. Un modo manos libres puede requerir el teléfono desbloqueado y la app en primer plano.

## Fuente pública de contratos
- https://developers.google.com/youtube/v3/live/docs/liveChatMessages/streamList
- https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types
- https://github.com/KickEngineering/KickDevDocs/blob/main/events/event-types.md
- https://github.com/HaishinKit/HaishinKit.swift
- https://github.com/obsproject/obs-websocket
- https://github.com/steveseguin/social_stream

**Declaración de cumplimiento**: no secrets, no apps OAuth configuradas, no eventos reales obtenidos, no audio sintetizado ni retransmisión. Nunca anunciar streaming funcional basándose solo en pruebas de contrato.
