# Verificación de puntos pendientes (13 oct 2026)

> **Claude.** Páginas leídas el 13 oct 2026. Estados: **VERIFICADO** (lo dice una fuente oficial que pude leer), **CONTRADICHO** (una fuente oficial desmiente lo que habíamos escrito), **PARCIAL**, **NO ENCONTRADO** (no pude leer una fuente oficial; no significa que sea falso). Nada de esto se probó en un teléfono real ni con las gafas.

## Tabla

| # | Punto | Estado | Resultado y fuente |
| --- | --- | --- | --- |
| 1 | TikTok LIVE: requisitos oficiales y clave RTMP | **NO ENCONTRADO** | Sus páginas de ayuda llegan como cascarón sin texto. Solo hay una guía de terceros (ver `ARCHITECTURE.md`). Hay que leerlas a mano en [soporte de TikTok](https://support.tiktok.com/en/live-gifts-wallet/tiktok-live/what-is-tiktok-live) |
| 2 | Instagram Live: requisitos oficiales | **NO ENCONTRADO** | Solo guías de terceros (cuenta profesional, clave en el escritorio). Sin fuente oficial legible |
| 3 | Kick: clave, protocolo, límites | **VERIFICADO** | [Guía oficial](https://help.kick.com/en/articles/7066931-how-to-stream-on-kick-com): URL y clave en el panel del creador; **solo H.264** ("no soporta H.265"); **máximo 1080p y 60 cuadros/s**; **1 000–8 000 kbps**; **CBR obligatorio**; cuadro clave cada 2 s; perfil main; audio estéreo, 48 kHz como máximo. RTMPS: solo aparece en un ejemplo de otra herramienta (`:443/app`), no como regla general. Requisitos de cuenta: no los menciona |
| 4 | YouTube: requisitos y códecs | **PARCIAL** | [Requisitos](https://support.google.com/youtube/answer/2474026): canal verificado, sin restricciones de transmisión en 90 días, 16 años. Los requisitos para móvil están en otra página que no leí; mínimo de suscriptores y espera de 24 h **no aparecen**. [Códecs en directo](https://support.google.com/youtube/answer/2853702): H.264, H.265 y AV1 aceptados; HDR solo con H.265; la tabla llega hasta 4K |
| 5 | Twitch: RTMPS, códecs, límites | **NO ENCONTRADO** | La guía oficial no cargó (error de estilos) y el Creator Camp es solo un índice. [Documentación de desarrolladores](https://dev.twitch.tv/docs/video-broadcast/): menciona RTMP, no RTMPS ni códecs |
| 6 | SDK de Meta: grabaciones antiguas, países, publicación | **PARCIAL** | [Discusión oficial #28](https://github.com/facebook/meta-wearables-dat-ios/discussions/28): en dic 2025 alguien pidió acceso a las grabaciones almacenadas en las gafas y Meta respondió que "lo está considerando a futuro". El CHANGELOG 1.0 no lo incluye. [FAQ](https://developers.meta.com/wearables/faq/): publicación "pronto" sin fecha; **la lista de países no está en esa página** |
| 7 | Meta Model API (Muse) | **VERIFICADO** en lo básico | [Documentación](https://dev.meta.ai/docs/overview): dirección base `https://api.meta.ai/v1`; compatible con el SDK de OpenAI **y** el de Anthropic (Chat Completions, Responses y Messages); clave tipo Bearer; llamadas a herramientas en paralelo y en streaming; entiende imágenes; pago por uso (transcripción de voz: 0,18 USD por hora). **NO ENCONTRADO:** llamadas desde el navegador (CORS) y países habilitados (la prensa de julio hablaba de EE. UU.) |
| 8 | ¿iPhone 17 codifica AV1 por hardware? | **NO ENCONTRADO** | Solo hay el artículo de [Bitmovin](https://bitmovin.com/blog/apple-av1-support): decodificación AV1 desde iPhone 15 Pro; Apple Silicon sin codificación AV1 (artículo viejo) |
| 9 | WebCodecs en Safari iOS 26 | **PARCIAL** | [caniuse](https://caniuse.com/webcodecs): soporte total desde iOS 26. **NO ENCONTRADO** qué códecs de video codifica (H.264, HEVC, AV1). Dato aislado: en 2023 WebKit añadió AV1 experimental con codificación **por software** ([Phoronix](https://www.phoronix.com/news/WebKit-TP-161)) |
| 10 | Mediabunny: recortar sin recodificar | **VERIFICADO**, con matiz | [Documentación](https://mediabunny.dev/guide/converting-media-files): copia por defecto si no hay cambios que obliguen a transcodificar. **Pero:** "fijar un inicio distinto del predeterminado forzará, por ahora, transcodificar video y audio". Recortar solo el final sí copia. La copia se ajusta a cuadros clave |
| 11 | HEVC y patentes en una app gratuita | **NO ENCONTRADO** | No leí fuentes oficiales de los consorcios. Hay que consultarlo antes de publicar en tiendas; no es consejo legal |
| 12 | Whisper en iPhone: tiempos | **NO ENCONTRADO** (y una corrección) | No hay mediciones en iPhone. Un artículo da "5–10 veces más rápido en WebGPU que en WebAssembly". **Ver abajo: CONTRADICHO** lo de que Safari no tiene WebGPU |

## Corrección importante: WebGPU sí existe en el iPhone nuevo

- **CONTRADICHO.** En `docs/RESOURCES.md` y en un comentario del issue #6 escribí, basándome en un artículo, que Safari no tiene WebGPU. Según [caniuse](https://caniuse.com/webgpu) está **soportado por completo en Safari de iOS 26 o superior**, y el [blog de WebKit](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/) dice que "se entrega en Safari 26 beta" para macOS, iOS, iPadOS y visionOS. Un iPhone 17 debería poder usar la ruta rápida de Whisper en el navegador. **Falta medir.** Ya corregí el archivo.
- El mismo artículo cometió el error, así que sus otras cifras merecen la misma cautela.

## Qué cambia para AgentCut

1. **Recorte sin pérdida:** en el editor web solo se puede copiar sin recodificar si el recorte empieza en el inicio del clip; los cortes en medio fuerzan recodificar (por ahora). Hay que decidir si aceptamos la recodificación o usamos un camino nativo más adelante.
2. **Transmitir a todos con un solo ajuste:** el denominador común verificado es H.264, perfil main, CBR, cuadro clave cada 2 s, audio AAC estéreo de 48 kHz, **1080p como máximo y 8 Mbps como máximo** (Kick). Con 5 a 6 Mbps en 1080p a 30 cuadros/s se cumple Kick y se llega al mínimo que YouTube indica para H.264 (5 Mbps a 1080p30), aunque lejos de su recomendado (14 Mbps). Las gafas entregan 720×1280 como máximo, así que a 720p vertical basta menos.
3. **Meta como proveedor de IA queda más cerca:** la API acepta el formato de OpenAI y el de Anthropic. Falta probar si el navegador puede llamarla directamente (CORS).

## Tu pregunta: grabo en 4K y las redes lo bajan de calidad

Lo que pude verificar y lo que no:

- **YouTube (verificado):** acepta 4K. Para subir 4K SDR a 30 cuadros/s recomienda **35–45 Mbps**, y para 1080p a 30, 8 Mbps ([fuente](https://support.google.com/youtube/answer/1722171)). Recomienda subir en H.264; la página no dice si acepta HEVC o AV1 al subir archivos. Para *ver* 4K el espectador necesita un navegador o aparato con VP9.
- **En directo (verificado):** YouTube admite hasta 4K; Kick, solo 1080p a 60 cuadros/s y H.264. Para Twitch, TikTok e Instagram no pude leer la fuente oficial.
- **Instagram y TikTok al subir (NO ENCONTRADO):** no pude leer sus especificaciones oficiales. Que recomprimen lo que subes es lo habitual, pero no lo confirmé en fuente oficial.

**Consecuencia de diseño (propuesta):** AgentCut no debe "subir el 4K y rezar". Debe tener **perfiles de destino**: el original 4K se conserva intacto como material de trabajo, y para cada red se exporta una versión ya ajustada (tamaño, cuadros, códec, peso) con lo que cada una pide, de modo que la bajada de calidad la controlemos nosotros y no el algoritmo de la red. Esos perfiles se rellenan solo con datos verificados; los que faltan (TikTok, Instagram, Twitch) quedan como "sin verificar" hasta leer su fuente oficial.

**Editor y transmisión comparten una sola tubería:** el material entra (cámara del teléfono o gafas), se guarda una copia local de buena calidad y, si hay directo, se envía además un flujo H.264 con el ajuste común de arriba. El editor trabaja siempre sobre la copia local, nunca sobre lo que la plataforma devuelve.

— Claude
