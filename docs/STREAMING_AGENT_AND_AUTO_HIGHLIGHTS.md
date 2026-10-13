# AgentCut · agente de streaming + clips automáticos post-LIVE
**Propuesta del propietario aclarada 2026-10-13 · Documentado por ChatGPT**
**Estado:** DISEÑO / NO IMPLEMENTADO / pruebas de hardware pendientes. Complementa [PR #12](https://github.com/Os-WHGo/agentcut/pull/12) y [PR #9 de Claude](https://github.com/Os-WHGo/agentcut/pull/9). **No fusionar main**.

## 0. Corrección de alcance y decisión de arquitectura

La persona propietaria **NO eligió "web-only" como requisito**. Quiere *un producto de teléfono que actúe como editor conversacional y agente de streaming con Ray-Ban Meta*. Web, nativa o híbrida son decisiones de implementación a comparar, no instrucciones del propietario.

**Dos experiencias de un mismo proyecto:** 
1. **Streaming Agent**: conectar gafas/cámara, seleccionar destinos LIVE autorizados (Twitch, Kick, YouTube, TikTok, Instagram), probar conexión, supervisar stream y **grabar copia local sin interrumpir la emisión**, con opción de marcador manual en vivo y automatización posterior.
2. **Editing Agent**: importar video/replay/grabación local, *entender órdenes* vía Claude/OpenAI y otros proveedores, analizar imagen/audio/metadatos, producir edición real controlada por herramientas, validar timeline/audio, exportar Reels/TikTok/Shorts/historias.

**Privacidad:** En modo edición sin publicación, medios permanecen en dispositivo salvo opt-in explícito. En modo LIVE, los medios **necesariamente salen por internet** hacia las plataformas elegidas (y opcionalmente un relay autorizado); informar claramente antes de conectar. Guardar claves de streaming en Keychain/Keystore o almacenamiento seguro equivalente; nunca en GitHub/logs. Ninguna transmisión comienza por órdenes de una IA sin acción explícita del usuario.

## 1. Cómo debería funcionar de punta a punta

```
Fuente: Ray-Ban Meta via DAT 1.0 (native SDK) o cámara del teléfono
      ├→ previa LIVE + selector de destino(s) y control de conexión
      ├→ codificador A/V → RTMP(S) autorizado (directo a plataforma)
      │                         o relay opcional para multistream
      ├→ grabación LOCAL **simultánea** y recuperable en segmentos
      └→ marca de tiempo monotónica + botón «Marcar momento»
                        ↓ al detener LIVE
            MediaIndex: grabación(es) + timecodes
                        ↓
        detección de escenas y silencios + transcripción
                        ↓
           candidatos de momentos destacados
            (voz, reacción, actividad visual,
             cambio de escena, marcador manual)
                        ↓
           IA razona con METADATOS/texto
           (fotogramas solo con permiso)
                        ↓
           tarjetas con minuto, duración y motivo
                        ↓ usuario confirma
         editor no destructivo + formatos de red social
                        ↓
         exportar localmente / publicar solo con permiso
```

**Regla técnica propuesta:** Nunca depender únicamente del VOD que proporciona una plataforma. Hacer una grabación local del stream (donde la capacidad del sistema y los permisos lo permitan), con segmentos de duración finita y un manifiesto para recuperar lo grabado si se corta internet o hay cierre por batería/temperatura. Preservar timecode de origen (wall-clock + media-time) para alinear marcas y clips. Audio/vídeo y sincronía deben probarse en el hardware.

Si la IA falla o internet se corta, la grabación local, los marcadores y la línea de tiempo no deben depender de ella.

## 2. Plataformas LIVE: adaptadores independientes

| Destino | Estado comprobado por fuentes | Lo que NO está confirmado |
| --- | --- | --- |
| **YouTube Live** | Admite servidor + clave de codificador; su ayuda indica que emisiones bajo 12h normalmente se archivan: https://support.google.com/youtube/answer/2907883 | Publicación sin cumplir requisitos de cuenta y de directos |
| **Twitch** | Documenta ingest RTMP y clave de streaming: https://dev.twitch.tv/docs/video-broadcast/ | Autenticación/canal específicos del usuario |
| **Kick** | Documenta URL + clave de retransmisión: https://help.kick.com/en/articles/7066931-how-to-stream-on-kick-com | Emisión real desde un dispositivo propio |
| **TikTok LIVE** | Existen requisitos de cuenta para LIVE; TikTok documenta acceso mediante LIVE Studio u OBS: https://support.tiktok.com/es/live-gifts-wallet/tiktok-live/moderating-on-tiktok-live | Clave RTMP/acceso mediante codificador disponible para cualquier cuenta, API móvil abierta de ingest |
| **Instagram Live** | Algunas cuentas profesionales elegibles pueden usar Live Producer y servidor RTMP (documentación de proveedor: https://castream.io/help/en/platform-guides/how-to-stream-to-instagram-live-via-rtmp) | Acceso universal desde apps de terceros, obtención de clave desde iPhone sin escritorio |

**Actualización contextual:** Meta ha publicado el 2026-10-12 que Instagram Live usa Media over QUIC **internamente** en sus apps: https://engineering.fb.com/2026/10/12/video-engineering/shipping-media-over-quic-at-meta-scale-for-instagram-live-ingest/ . Eso **NO** es una API publicada para que AgentCut emita a Instagram usando MoQ. Nunca crear integraciones basadas en ingeniería inversa de protocolos privados o eludir permisos de plataforma.

**Simultáneo:** opción 1 → transmitir por separado a cada destino (banda de subida multiplicada aproximadamente por N); opción 2 → enviar un stream a un **relay** propio/autorizado que lo distribuya a varios destinos, reduciendo uso de subida del teléfono. Relay requiere servidor e internet y puede generar costo, aunque su software sea libre. Presentar ambos costos. **Sin aprobación del propietario, no construir un servidor de retransmisión obligatorio.**

## 3. Repositorios candidatos y licencias de REPOSITORIO verificadas

| Recurso | Papel concreto | Licencia de repo | Pendiente de verificar |
| --- | --- | --- | --- |
| [Meta DAT iOS](https://github.com/facebook/meta-wearables-dat-ios) / [Android](https://github.com/facebook/meta-wearables-dat-android) | Cámara/micrófono de gafas hacia app nativa | **Meta Developer Terms; NO OSS** | Publicación/región/método de audio según versión |
| [FrameFlow](https://github.com/KilimcininKorOglu/FrameFlow) | Referencia Android gafas→stream/record | **MIT** | Actualizar DAT 0.2.x, compilación/hardware |
| [SpecBridge](https://github.com/sashimi0/specbridge) | Referencia iOS gafas→Twitch RTMP | **MIT** | Actualizar DAT e integrar audio/seguridad |
| [RootEncoder](https://github.com/pedroSG94/RootEncoder) | Codificador/RTMP-SRT Android | **Apache-2.0** | Transportes, bitrate, compresión/reconexión reales |
| [HaishinKit Swift](https://github.com/HaishinKit/HaishinKit.swift) | Streaming RTMP/SRT iOS | **BSD-3-Clause** | Handoff buffers DAT, compilación y audio |
| [HaishinKit Kotlin](https://github.com/HaishinKit/HaishinKit.kt) | Streaming RTMP Android | **BSD-3-Clause** | Integración y pruebas |
| [MediaMTX](https://github.com/bluenviron/mediamtx) | Relay/record/proxy opcional RTMP/SRT/WebRTC | **MIT** | Hosting, configuración, endpoints autorizados, costo |
| [SRS](https://github.com/ossrs/srs) | Relay multimedia opcional | **MIT** | Hosting, capacidad multi-destino, seguridad, costo |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | Algoritmos de cortes/cambio de escena como referencia | **BSD-3-Clause** | Python/OpenCV no se portan automáticamente a móviles |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | ASR/transcripción local | **MIT** | Idiomas/pesos, consumo en iPhone y licencias de modelos |
| [silero-vad](https://github.com/snakers4/silero-vad) | Detección de voz / silencios | **MIT** | Integración móvil y licencias de pesos |
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | Manejo de medios web, si se elige componente web | **MPL-2.0** | Safari móvil y tiempos de exportación |

**Verificación:** Licencias reportadas por metadatos de GitHub de repositorios el 2026-10-13. **No** significa que modelos descargados, SDK Meta, assets, dependencias, distribuciones o combinaciones tengan idéntica licencia. Las referencias FrameFlow/SpecBridge son experimentales, no casos de éxito confirmados.

**Dato oficial crítico (verificado):** DAT 1.0 [iOS CHANGELOG](https://github.com/facebook/meta-wearables-dat-ios/blob/main/CHANGELOG.md) etiqueta **Camera audio streaming PCM** como **[Experimental]**, y establece que las funciones experimentales pueden probarse pero no publicarse aún. El ejemplo oficial [CameraAccess](https://github.com/facebook/meta-wearables-dat-ios/blob/main/samples/CameraAccess/README.md) documenta grabación con sonido opcional, no asegura que el audio PCM experimental esté liberado para aplicaciones distribuidas. Hay que separar audio local, Bluetooth, SDK y permisos; no prometer retransmisión pública con audio de gafas sin auditoría.

## 4. Agente de streaming: capacidades propuestas

**Mínimo funcional streaming (primero para esta línea de trabajo):**
- Seleccionar fuente: gafas soportadas si DAT lo permite, si no cámara/micrófono del teléfono.
- Previsualizar en pantalla orientación vertical/horizontal, resolución, fps y estado audio.
- Seleccionar **un destino** permitido por cuenta y configurar RTMP(S) o adaptador oficial.
- Configuración temporal de server/key sin filtrar secretos.
- Inicio y parada únicamente con confirmación visible.
- **Guardar grabación local simultánea**, con duraciones acotadas y recuperación.
- «Marcar momento» con pulsación y etiqueta opcional.
- Detectar errores de conexión/temperatura/batería; UI de estado y reintento no destructivo.
- Comprobar en hardware, duración, frame drops, A/V sync y comportamiento en background.

**Después**: destinos adicionales, relay multistream, escena cámara frontal/picture-in-picture, chat multiplataforma si cada plataforma ofrece API y permisos, superposiciones, comandos de voz permitidos y clips sugeridos *durante* LIVE. No prometer chat unificado de plataformas ni reconexión automática sin APIs/credenciales específicas.

## 5. Agente de edición de highlights después del directo

**Objetivo:** al acabar LIVE presentar sugerencias del material grabado, no un montaje inventado sin revisar.

1. **Preparación inmediata**: indexar segmentos guardados, recuperar manifest, duración y timecode; verificar pistas audio/video intactas.
2. **Análisis local**: transcripción (Whisper), voces/silencios (VAD), transiciones/cambios visuales, cambios de volumen, picos de movimiento y **marcadores manuales**. Si hay chat/eventos de plataformas, usarlos **solo** por APIs autorizadas y dentro de permisos.
3. **Ranking heurístico y/o modelo local**: crear candidatos por evidencia real, no suponer que picos de volumen = calidad. El propietario puede escoger criterios: humor, sorpresa, paisaje, información, interacción, DJ, etc. La IA avanzada opcional razona desde transcripciones, marcas temporales y metadatos; enviar fotogramas/audio a nube solo con autorización específica.
4. **Tarjetas revisables** con `start_ms`, `end_ms`, `reason`, `confidence`, miniatura local y link a clip original. Guardar múltiples puntuaciones por formato/longitud y un botón «Descartar».
5. **Editor no destructivo** aplica cortes en copia/proyecto, deja margen al principio/final de palabra, elimina o conserva silencios intencionalmente, puede añadir subtítulos y reencuadrar. Nunca alterar el original.
6. **Exportaciones propuestas**: TikTok / Instagram Reels / YouTube Shorts (normalmente 9:16), historias (9:16), clips horizontales 16:9, y edición larga opcional. Validar requisitos de cada plataforma (duración, codec, proporciones, música) en ese momento; no imponer duraciones fijas inventadas.
7. **Publicación** siempre independiente, basada en permisos o entrega de archivo para subir manualmente; no inferir que un API de LIVE también autoriza subir Reels/TikTok automáticamente.

**Marca de tiempo:** guardar en cada evento `source_id`, `recording_segment_id`, `media_time_ms`, `wall_clock_utc`, `event_type`, `origin` (manual/heuristic/provider), opcional `platform_event_id`. Evitar desajustes si el stream se reconecta o se pierde un segmento.

**Opcional con valor alto:** al empezar a transmitir mostrar «Al terminar, proponer los mejores momentos». Se puede desactivar para ahorrar batería. Priorizar análisis **al finalizar**, no inferencia constante en vivo que afecte FPS o temperatura.

## 6. Arquitectura por decidir (NO imponer web-only)

| Variante | Ventajas | Costos/obstáculos |
| --- | --- | --- |
| **Nativa iOS + Android** | Mejor acceso al SDK de Meta, cámara y codificadores del OS, grabación sostenida | Dos plataformas, compilación, firma, permisos, distribución; para iOS desarrollo con Xcode/macOS usualmente necesario (o builds remotos + firma, a comprobar) |
| **Híbrida con UI compartida y módulos nativos** | Reutilizar editor/chat/UX y conectores; hardware/streaming por módulos por OS | Bridge multimedia complejo; hay que medir transferencia/sincronía de buffers de cámara y exportación |
| **Web + puente nativo opcional** | Editor web ágil y opcional acceso a gafas por app instalada | Más pasos, permisos y transiciones para usuario; streaming completo solo web con gafas NO está verificado |

**Recomendación a evaluar, no decisión:** probar primero un puente nativo mínimo DAT → vista previa → grabación local; si eso funciona, añadir encoder → una plataforma RTMP de prueba; en paralelo reutilizar editor web como prototipo para cortes/exports. El propietario escoge arquitectura después de ver pruebas.

## 7. Pruebas de aceptación por etapas

- **S0 streaming**: preview Ray-Ban Meta en dispositivo soportado y grabar 60 s local con audio autorizado; reportar iOS/Android, modelo gafas, resolución, fps, memoria, temperatura y permisos. **No verificado**. Si audio SDK es experimental, probar alternativa con micrófono teléfono sin ofrecer la primera para distribución pública.
- **S1 LIVE**: 5 minutos a destino RTMP con permiso, mientras guarda localmente; comprobar archivo reproducible y continuidad tras corte de red. **No verificado**.
- **S2 highlights**: del archivo de S1 obtener 3 candidatos con tiempos verdaderos, razones y vistas previas; exportar 9:16 sin alterar original. Se puede ensayar **sin gafas ni red** con un video local de prueba.
- **S3 multiplataforma**: segundo destino o relay opcional con control de ancho de banda/costos; TikTok e Instagram solo si la cuenta tiene acceso oficial y se ha comprobado. **No verificado**.
- **S4 agente IA**: instrucciones «resúmeme el directo y haz 3 reels», edición auditable, voz/subtítulos gratuitos en caso de ser técnicamente viables; todos los cambios revisables.

**Siguiente entrega pequeña sugerida a Claude:** Implementar **S2 con un video local corto** como demostración del agente de highlights (sin bloquear por DAT/streaming); investigar en paralelo **S0**, sin reemplazar el trabajo del PR #5. PR de código independiente, simulación de marcadores manuales y tests automatizados; prueba real la hace el propietario.

**No se ha implementado ni verificado este flujo de extremo a extremo. Los cambios son propuestas para el dueño y revisión de Claude.**

— ChatGPT
