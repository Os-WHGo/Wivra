# Wivra · biblioteca inteligente local + alertas LIVE propias, multiplataforma

**Fecha:** octubre 2026. **Fuente:** pregunta explícita del propietario tras confirmar Wivra como UNA app de Editor + LIVE Studio, CG 2D gratis, biblioteca compartida de memes/imagen/audio/video y Control Deck. **Estado:** contrato funcional y hallazgos de API oficiales; NO alertas reales implementadas, ni conexiones de cuenta, ni engine RTMPS validado.

**Continuidad:** al entregar la especificación anterior se finalizaron correctamente los documentos, plan maestro y comentarios en GitHub; el nuevo mensaje del propietario no interrumpió ningún cambio pendiente de ese trabajo. Los últimos cambios están en PR #52, sin merge a main.

## 1. Biblioteca única con Recientes / Más usados / Favoritos / Sugerencias útiles

La misma biblioteca local está presente en **Editor** (pistas y timeline) y en **LIVE Studio** (botones instantáneos de Scene Deck/Asset Launcher); un asset se importa una sola vez, con un mismo ID y archivo local referenciado, sin duplicarlo al reutilizarlo.

**Organización propuesta:**
- **Favoritos:** el usuario marca/desmarca como favorito cualquier asset o plantilla; posición fija/preferente.
- **Recientes:** fecha de último uso/importación; distinguir historial de visualizaciones de historial de uso efectivo.
- **Más usados:** un contador local por asset/preset, incrementado SOLO cuando se insertó efectivamente en proyecto/editor o se activó en escena de salida LIVE, NO por vista previa/carga; no sumar doble por reintentos o rehidratación. Ordenar por uso relativo con opción «últimos 30 días» / «histórico», y desempate por último uso.
- **Memes clásicos/plantillas útiles:** colección curada de *estilos y plantillas originales* (reacción, fallo, sorpresa, reportaje absurdo, comparativa, precio, alerta), memes/images de usuario y, si se licencia individualmente, imágenes de bibliotecas externas. **«Clásico» no significa sin copyright**. No incluir por defecto fotos/rostros o memes virales de terceros sin derechos claros.
- **Sugerencias útiles:** al principio heurística LOCAL y gratuita según contexto: Editor (video vertical, texto, escenas, duración, proyecto); LIVE (última escena, tipo de overlay, favoritos recientes), uso y etiquetas asignadas por el usuario. Nunca sugerir directamente basado en conversación/micrófono/videofotogramas sin que el usuario elija análisis/IA ni usar telemetría secreta. Se puede añadir recomendación IA opt-in después si beneficia al editor director.
- **Búsqueda y filtros:** categoría (meme, sticker, video, imagen, audio, CG), etiquetas, duración, orientación, favoritos; búsqueda por nombre y metadata manual; «añadir a botones rápidos» para LIVE.
- **Colección pequeña incluida sin red** y opción importar archivos propios: imágenes, capturas, PNG transparentes, GIF/video compatible, SFX. Catálogos online opcionales y autorizados, evitando subir automáticamente archivos privados y mostrando dependencia de red/licencias.

**Interfaz concreta:** desde LIVE «Memes» → pestañas Favoritos / Más usados / Recientes / Plantillas / Buscar, botón disparar; desde Editor → biblioteca → mismo asset → «Añadir a pista» con duración/posición y transiciones. Favoritos y métricas sincronizados LOCALMENTE dentro de la instalación. Si en futuro se conectan dispositivos, sincronización opt-in con conflictos resueltos, no asumirla ahora.

**Esquema conceptual** (no API real):
- AssetUsage(assetId, effectiveUseCount, lastUsedAt, lastUsedContext, usage30Days, favorite, tags[], pinnedToLiveDeck, recentlyImportedAt)
- EffectiveUseEvent(eventId, assetId, context=editor|live, occurredAt, projectId?, countOnce=true)
- Reglas: privacidad local-first, ninguna analítica remota para ordenar; evitar contadores al previsualizar; borrar un asset elimina favoritos/índice coherentemente pero no debe destruir proyectos sin aviso y manejo de referencias. Permitir «Restablecer sugerencias», «Limpiar recientes», «Quitar de favoritos».
- No inflar con 1000 memes descargados automáticamente, sin suscripción/premium/paid pack, preservar atribuciones/licencias y condiciones de proveedores.

## 2. Tres elementos independientes: enviar stream, recibir evento, mostrar alerta

1) **Salida RTMP(S):** RTMPS URL + stream key son credenciales de **ingesta de A/V**; no autorizan a leer followers, suscriptores ni donaciones. Claves nunca en logs/repos ni dentro del archivo de proyecto.
2) **Ingesta de eventos:** proveedor externo usando OAuth scopes y API/WebSocket/webhook/event stream (según plataforma) o conexión autorizada a un proveedor de alertas. NUNCA usar stream key en lugar de autorización de API.
3) **Render de alertas**: Wivra recibe evento normalizado → regla de disparo → cola/dedupe → plantilla CG local 2D (imagen/texto/sonido) → compositor LIVE → encoder → RTMPS. Editor puede reutilizar las mismas plantillas, pero no inventar eventos reales al editar.

**Ejemplos:** nueva suscripción → banner con nombre durante 4s; Super Chat → tarjeta con monto autorizado, mensaje y sonido; comentario seleccionado manualmente → panel de reacción. No anunciar integración como activa sin credenciales/autorización.

## 3. Fuentes oficiales consultadas / factibilidad

### Twitch: objetivo inicial de integración directa
- Twitch EventSub Subscription Types: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/ incluye follow, subscribe, subscription gift, cheer, raid y eventos chat bajo scopes específicos. No todos son accesibles para cualquier token y no todos los seguidores se entregan retroactivamente.
- WebSocket móvil: https://dev.twitch.tv/docs/eventsub/handling-websocket-events permite escuchar notificaciones cercanas al tiempo real, con keepalive/reconexión.
- Gestión/autorización: https://dev.twitch.tv/docs/eventsub/manage-subscriptions/ WebSocket exige user access token y permisos según tipo; webhook server exige app access token, servidor accesible y permisos adicionales. Para app inicialmente local iPhone, evaluar WebSocket para evitar servidor obligado (sin garantizar estabilidad en background).
- Twitch stream key NO recibe eventos.

### YouTube LIVE: objetivo inicial tras Twitch
- YouTube LiveChatMessages: https://developers.google.com/youtube/v3/live/docs/liveChatMessages incluye chat, SuperChat, SuperSticker, membresía y regalos donde se habiliten; se limita al live activo, cuotas/permisos aplican.
- Streaming low-latency en streamList: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/streamList; mostrar solo eventos realmente permitidos y normalizar IDs para reconexión.
- YouTube stream key NO recibe esos eventos; API/OAuth y chatId reales necesarios.

### Proveedor de alertas externo, opcional
- Streamlabs guía actual https://support.streamlabs.com/hc/en-us/articles/52499995174299-Setting-up-Your-Streamlabs-Alerts: se enlazan cuentas y personaliza tipo, imagen, sonido, layout, duración.
- StreamElements overlays https://docs.streamelements.com/overlays y https://docs.streamelements.com/selive/guides/overlays-and-alerts: renderizan AlertBox/browser source mediante URL que se trata como secreto, además de widgets y eventos.
- Si Wivra permite una **overlay URL externa**: usar web compositor/sandbox apropiado, políticas de contenido, límites de consumo de CPU/ram, control de audio/alpha/transparencia, cierre/reintento y no exponer URL privada en pantalla/logs. **No** asumir que un iframe/browser source de OBS funciona directo en AVFoundation/encoder iOS; primero spike real y revisar términos de servicios.
- Alternativamente Wivra puede recibir eventos de los proveedores por API autorizada y mostrar la animación CG propia, sin depender de navegador; condiciones de API/uso por revisar.

### TikTok/Instagram
- No se encontró en la consulta actual una API oficial pública garantizada de eventos LIVE generales para apps móviles terceros equivalente a Twitch EventSub. **No prometer follow/gifts automáticos en Wivra solo con stream key** ni utilizar scraping o protocolos privados no autorizados. Mantener alertas locales manuales y condicionar conectores automáticos a la ruta aprobada para la cuenta/proveedor concreto.

### Costos
- El renderer local CG y la biblioteca pueden ser gratuitos, igual que integración OAuth/EventSub donde API y cuota lo permitan. **No prometer costo total de cero**: los servicios externos, red, relay, servicios de donaciones y procesamiento online pueden tener restricciones/tarifas. No exigir servidor de pago para una alerta manual; ofrecer modo directo local y proveedor opcional.

## 4. Panel Alertas del LIVE Studio (Wivra, NO configurador externo)

**Pestaña Alertas en Control Deck**:
- **Alertas manuales:** crear rótulo/efecto gráfico (saludo, dato, precio, aviso, meme), reproducir video/sonido local; botones rápido «Mostrar», «Ocultar», «Probar» y temporizador. Esto funciona offline excepto la transmisión propiamente dicha.
- **Alertas automáticas:** vincular Twitch/YouTube por OAuth, escoger eventos que realmente soporte el conector, asociar plantilla, texto con variables permitidas (nombre, importe), audio local, duración, posición, prioridad y reglas para evitar spam. Estado de conexión/desconexión. Botón «Enviar alerta de prueba» local que NO finge evento externo.
- **Cola controlada:** eventos normalizados con ID externo, origen, timestamp y scope; deduplicación por event ID, rate limit, prioridad y expiración; «Siguiente», «Pausar», «Silenciar», «Descartar», «Repetir última» con consentimiento. Evitar que 30 nuevos eventos tapen la imagen o cuelguen el teléfono.
- **Moderación/seguridad:** escapar y filtrar nombre/mensaje del usuario antes de renderizar (XSS/control chars), límites de longitud, datos sensibles, no mostrar aportes privados ni contenido abusivo sin filtros; volumen con limitador y ducking opcional sobre voz, no reproducir sonidos inesperados altísimos.
- **Audiencia/monitor:** mostrar viewers/chat/contadores solo cuando API provea datos reales; no inventar número de espectadores o seguidores. La alerta puede ser vista solamente en preview antes de estar ON AIR.

**Reutilización con Editor:** plantillas de alerta y memes son asset gráfico común; los eventos reales durante LIVE pueden guardarse como cues temporales con consentimiento y aparecer en Editor como CG editable SI se guarda medio/metadata. Export y editor no requieren OAuth para abrir antiguos CG.

## 5. Pruebas de aceptación y prioridad

P0 **biblioteca compartida**: importar 3 memes propios y 2 imágenes, usar uno 5 veces en editor/Live Deck, otro 2 veces, confirmar lista «Más usados», que previsualizar no cuente; fijar 2 favoritos, limpiar recientes, guardar/reabrir; sin red, sin duplicar fichero, sin volver a descargar.

P0 **alerta manual**: crear banner «ATENCIÓN: se acabó el pan» con sonido libre, preview, disparo y retiro durante simulación LIVE, con cola/limites y guardado como CG reutilizable en Editor. En stream real se probará solo cuando exista encoder funcional.

P1 **Twitch EventSub**: sesión OAuth y user scopes reales, suscripción al evento, recibir notificación, autenticar/normalizar/deduplicar, mostrar CG propio dentro de compositor, evitar notificaciones duplicadas por reconexión, opciones mute/skip/pausa. Prueba simulada no equivale a integración.

P1 **YouTube LiveChat**: OAuth/LiveChatId vigente, streamList, superChat/chat test según permisos/evento real; alertas al mismo CG renderer, moderación y logs sin información privada innecesaria.

P1/P2 **terceros**: overlay URL StreamElements/Streamlabs importada a escena en plataforma compatible, verificar transparencia/audio, red/FPS, panel privacidad y cancelación. Su viabilidad en iPhone NO demostrada. TikTok/Instagram automation solo tras API oficial autorizada.

**Arquitectura/responsables:** ChatGPT mantiene contratos/biblioteca común y LIVE/alertas en módulo streaming sin sobrescribir editor Claude; Claude PR #44 trabaja biblioteca/índice/CG temporizado en Editor. Acordar contratos y responsabilidad de estado con issue #49 antes de implementaciones duplicadas. Meta AI aporta investigación DAT si hace falta. Ningún merge a main sin autorización.

**No confundir UI de prototipo con función LIVE conectada. No transcribir/almacenar nombres de espectadores sin fin ni subir assets privados sin permiso.**

— ChatGPT
