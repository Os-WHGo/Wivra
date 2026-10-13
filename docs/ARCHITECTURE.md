# Arquitectura de AgentCut: recomendación técnica

> **Propuesta de Claude, 13 oct 2026. La decisión final es del propietario del repo.**
> Cada dato dice si es **[V] verificado** (leí la fuente o el código ese día) o **[NV] no verificado**. Nada de lo de abajo se probó en un iPhone ni en gafas reales.

## 0. Corrección de rumbo

El README y `AGENTS.md` decían "app web solo para teléfono". Eso fue una interpretación mía y de ChatGPT, no una decisión del propietario. Este documento la reemplaza: **la arquitectura queda abierta y se decide con los datos de abajo**. Lo único fijo es el objetivo: abrir AgentCut en el teléfono, elegir videos o conectar las gafas, hablar con la IA preferida y que el editor ejecute lo pedido.

## 0b. Decisiones del propietario (13 oct 2026, dichas en el chat con Claude)

- **Una sola app**, no dos productos: editor con IA y, más adelante, transmisión (IRL, Ray-Ban Meta). Lo grabado en vivo debe abrirse como proyecto en el mismo editor.
- **Prioridad al editor.** Orden: 1) editor con IA que funcione en el teléfono (importar, observar, operaciones validadas, vista previa, exportar); 2) grabar sin conexión con marcadores; 3) investigar y construir la transmisión, sin bloquear lo anterior.
- **Sin clave de API por ahora.** El primer prototipo usa el modo "copiar y pegar" con ChatGPT o Claude normales (`app/`, PR #30) y, más adelante, opciones gratis (Gemini, GitHub Models) o IA local. Qué IA controla mejor se decide con la prueba de aceptación (sección 7), no antes.
- Idiomas, traducción y subtítulos: el propietario cree que OpenAI es lo mejor. **[NV]** Se probará, no se da por hecho.
- Un clasificador "descartar lo que no sirve antes de editar" va antes que cualquier procesamiento masivo (issue #28). Los "300 videos" eran un ejemplo, no la meta.

## 1. Recomendación en una frase

**Un núcleo en TypeScript (proyecto, operaciones, validador, agente de IA, motor de edición) que hoy corre en el navegador del iPhone y más adelante se mete dentro de una app nativa pequeña (Capacitor u otra cápsula), la cual añade solo lo que la web no puede hacer: cámara de las gafas y transmisión en vivo.**

Es decir: empezar con la opción **C** (web + puente nativo opcional) y crecer a la **B** (híbrida) cuando lleguemos a gafas y streaming. La **A** (dos apps nativas) se descarta por ahora.

## 2. Comparación

| | A. Nativa iOS + Android | B. Híbrida (interfaz compartida + módulos nativos) | C. Web + puente nativo opcional |
| --- | --- | --- | --- |
| IA y agente | Hay que escribirlo dos veces (Swift y Kotlin) | Una sola vez, en TypeScript | Una sola vez, en TypeScript |
| Editor de video | Dos editores: AVFoundation (iOS) y Media3 Transformer (Android) | Un editor web; motores nativos opcionales | Un editor web |
| SDK de Meta (gafas) | Directo, sin intermediarios | Mediante un plugin nativo | Mediante una app puente aparte |
| Streaming RTMP | Directo (HaishinKit / RootEncoder) | Plugin nativo | App puente aparte |
| Probar sin computadora | **No para iPhone**: compilar exige macOS | Solo después de tener compilación en la nube | **Sí**: se abre un enlace |
| Esfuerzo | El más alto (dos bases de código) | Medio | El más bajo al inicio |
| Riesgo principal | Doble trabajo y requisitos de firma de Apple | Que el plugin de gafas dé guerra | Que el puente quede desconectado del editor |

**Por qué C primero:** el propietario solo tiene iPhone y no quiere depender de una computadora. La web es lo único que se puede probar hoy con un enlace. Además, todo lo "inteligente" (entender instrucciones, planear, validar, corregir) es lógica que no depende de la plataforma, así que escribirla una vez es lo más barato.

**Por qué no A:** duplica el trabajo y no resuelve el problema del Mac. **Por qué se pasa a B:** las gafas y el RTMP no existen en el navegador (ver 4 y 5).

### Hechos que sostienen la comparación

- **[V]** Safari de iPhone: WebCodecs "totalmente soportado" desde iOS 26; entre 16.4 y 18.7 solo parcial ([caniuse](https://caniuse.com/webcodecs)). Con un iPhone 17 (iOS 26 o más) el plan B de exportación con Mediabunny es viable; **hay que medirlo**.
- **[V]** Android: Media3 Transformer recorta, recorta el cuadro, aplica efectos y convierte formatos sobre MediaCodec; Android 6.0 o superior; ejemplos de código bajo Apache-2.0 ([documentación](https://developer.android.com/media/media3/transformer)). **[NV]** velocidad, fusión de clips y HDR en la práctica.
- **[V]** Compilar para iPhone sin Mac propio: los ejecutores macOS de GitHub Actions son gratis e ilimitados en repos públicos ([docs](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)). **[NV]** que el flujo completo (compilar, firmar, instalar en el iPhone) funcione sin computadora.
- **[V]** Instalar en un iPhone: Apple Developer Program cuesta 99 USD al año; con cuenta gratuita los perfiles caducan a los 7 días ([Apple](https://developer.apple.com/support/compare-memberships/)). TestFlight: los testers externos requieren que la primera versión pase la revisión de Apple ([Apple](https://developer.apple.com/testflight/)). **[NV]** que TestFlight exija la membresía de pago (lo sé por conocimiento general, no por la página) y cuánto dura cada versión.
- **[V]** Capacitor es MIT y permite escribir plugins nativos para conectar la web con SDKs de iOS y Android ([LICENSE](https://github.com/ionic-team/capacitor/blob/main/LICENSE), [docs](https://capacitorjs.com/docs)). Es un candidato, no una decisión; también valdría una app Swift/Kotlin mínima con un WebView.

## 3. Núcleo de IA: cómo se cumple "entiende lo que pido"

El requisito clave es que **la IA nunca toque el video directamente**: produce operaciones sobre un proyecto, y el editor las valida y ejecuta. Así se pueden detectar errores y corregir conversando.

```
Instrucción ─► IA (Claude / ChatGPT / Meta / otras) ─► plan ─► operaciones
                                                              │
        proyecto (JSON) ◄── aplica ◄── validador ◄────────────┘
              │                            │ errores en texto claro
              ▼                            ▼
   vista previa / exportación        vuelven a la IA, que corrige
```

1. **Proyecto = un JSON** (medios, pistas, clips con inicio/fin, textos, subtítulos, versión). Es la única fuente de verdad y lo que la IA lee.
2. **Operaciones pequeñas y comprobables** (las del issue #3): cada una valida sus argumentos y devuelve el nuevo estado o un error.
3. **Validador** después de cada lote: clips fuera del rango del medio, solapes, huecos, duración total, audio y video con distinta duración, resolución de exportación. Los errores vuelven a la IA como texto.
4. **Historial**: cada lote es una entrada que se puede deshacer, para corregir sin empezar de cero.
5. **Análisis del material** (issue #6): fotogramas, transcripción y metadatos (fecha, GPS si existe) se convierten en texto y miniaturas que la IA recibe. **[V]** Claude no acepta video como entrada, solo imágenes y texto; hay que mandarle fotogramas (cerrado como "no planeado" en marzo 2026). **[NV]** costo y calidad de leer carteles o calles con cada proveedor.
6. **Proveedores intercambiables** (issue #8): adaptadores para Anthropic, formato OpenAI, Gemini y Meta. **[NV]** que se pueda llamar a cada API directo desde el navegador (CORS).

### Mini IA local

- **[V]** MediaPipe LLM Inference (Google) cubre Android, iOS y web y ejecuta Gemma, pero ya está en "solo mantenimiento"; Google recomienda pasar a LiteRT-LM ([docs](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference)). La página no documenta llamadas a herramientas.
- **[V]** Muse Glimmer (Meta, pesos abiertos) no es para teléfono (ver `docs/RESOURCES.md`).
- **[NV]** Todo lo demás: rendimiento, batería y fiabilidad al encadenar herramientas en un iPhone real. Uso razonable cuando se pruebe: órdenes sencillas ("corta al segundo 5") sin internet; los planes largos se quedan en la nube.
- Voz, subtítulos y narración abiertos y gratis: ya recogidos en PR #4 y en `docs/RESOURCES.md`; se conectan por el mismo contrato de herramientas.

## 4. Ray-Ban Meta: qué es documentado, experimental y probado

| Capacidad | Estado | Fuente |
| --- | --- | --- |
| Importar grabaciones ya hechas | **[V por ChatGPT, PR #12]** la app Meta AI las pasa a Fotos y de ahí se eligen en AgentCut. **[NV]** de punta a punta en AgentCut | Meta, PR #12 |
| Video en vivo de las gafas a una app nativa | **[V]** documentado en DAT 1.0 | [CHANGELOG iOS](https://github.com/facebook/meta-wearables-dat-ios/blob/main/CHANGELOG.md) |
| Calidad del video en vivo | **[V]** máximo 720×1280 (`high`), 504×896 (`medium`), 360×640 (`low`); 2, 7, 15, 24 o 30 cuadros/s; `raw` o HEVC (`hvc1`). Meta avisa que menos resolución y cuadros dan mejor imagen por la compresión Bluetooth | `AGENTS.md` del repo iOS |
| Grabar a archivo con el SDK | **[V]** el ejemplo CameraAccess graba con `AVAssetWriter` (HEVC + AAC), y desde 0.9.0 sigue grabando con la app en segundo plano | repo iOS, `Media/VideoRecorder.swift`, CHANGELOG |
| Audio de las gafas dentro del stream | **[V] experimental**: "las apps que lo usan aún no se pueden publicar" | CHANGELOG 1.0.0 |
| Foto de alta calidad, voz, movimiento, entradas | **[V] experimental**, tampoco publicable | CHANGELOG 1.0.0 |
| Errores de térmica y batería | **[V]** `thermalHot`, `peakPowerLimit`, `batteryLow`: una transmisión larga puede cortarse sola | CHANGELOG 1.0.0 |
| Modelos compatibles | **[V]** Ray-Ban Meta Gen 1 y 2, Ray-Ban Meta Display, Oakley Meta HSTN y Vanguard; "las capacidades varían por dispositivo" | [FAQ de Meta](https://developers.meta.com/wearables/faq/) |
| Publicar en tiendas | **[V]** todavía no abierto ("pronto", sin fecha). El SDK se descarga en cualquier país, pero la funcionalidad completa solo en países con gafas compatibles | FAQ de Meta |
| Probarlo uno mismo | **[V]** requiere gafas emparejadas con la app Meta AI y modo desarrollador; el SDK de Android está en Maven Central sin token (versión 1.0.1); el de iOS se instala con Swift Package Manager | READMEs |
| Licencia del SDK | **[V]** Términos de Meta, **no** es software libre; no se copia dentro de AgentCut, se usa como dependencia | `LICENSE` |
| Reglas de uso | **[V]** la política de uso prohíbe tapar el LED de grabación y captar a otras personas de forma encubierta; no dice nada explícito sobre transmitir a plataformas | [Política de uso](https://wearables.developer.meta.com/acceptable-use-policy) |
| Con hardware real | **Nada probado por nosotros.** Tampoco por los repos de ejemplo, según lo que leí | |

### Los repos que pediste

| Repo | Qué es | Licencia [V] | Estado [V] | Utilidad |
| --- | --- | --- | --- | --- |
| [meta-wearables-dat-ios](https://github.com/facebook/meta-wearables-dat-ios) / [-android](https://github.com/facebook/meta-wearables-dat-android) | SDK oficial y ejemplos (CameraAccess, DisplayAccess, BirdSpotter) | Términos de Meta | 1.0.1 del 9 oct 2026 | Base para el puente. El ejemplo iOS ya graba video con audio |
| [FrameFlow](https://github.com/KilimcininKorOglu/FrameFlow) | App Android: gafas → RTMP, con grabación local; usa RootEncoder | MIT | Último cambio 17 sep 2026; usa DAT **0.2.1** (antes del 1.0) | Idea de cómo conectar las gafas con el codificador. Hay que actualizarlo a 1.0.x. Plataformas que declara: **[NV]** |
| [SpecBridge](https://github.com/sashimi0/specbridge) | App iOS: gafas → Twitch con HaishinKit | MIT | Último cambio 4 ene 2026; DAT **0.2.1** y HaishinKit 2.2.2; Twitch fijo en el código; **pide Mac y Xcode** | Referencia del "arranque" del codificador. No se puede compilar sin Mac |
| [RootEncoder](https://github.com/pedroSG94/RootEncoder) | Android: cámara a RTMP, RTMPS, RTSP y SRT; H.264, H.265, AV1; graba MP4 mientras transmite | Apache-2.0 | Activo (9 oct 2026) | Motor de streaming en Android |
| [HaishinKit.swift](https://github.com/HaishinKit/HaishinKit.swift) / [.kt](https://github.com/HaishinKit/HaishinKit.kt) | iOS y Android: RTMP y SRT; "multi-streaming" (varios servicios a la vez) en Swift; WHIP/WHEP en alfa | BSD-3-Clause | Activos (oct y sep 2026) | Motor de streaming en iOS. **[NV]** que "multi-streaming" aguante varios destinos en un iPhone real |

## 5. Transmisión en vivo

Lo que sigue mezcla fuentes oficiales y guías de terceros; está marcado. **No se promete ninguna plataforma sin prueba.**

| Plataforma | Qué encontré | Fuente | Estado |
| --- | --- | --- | --- |
| **YouTube Live** | Acepta RTMP/RTMPS (recomienda RTMPS); video H.264, H.265 o AV1; audio AAC o MP3. Exige canal verificado y sin restricciones de transmisión en 90 días; edad mínima 16 | [YouTube (oficial)](https://support.google.com/youtube/answer/2853702) | **[V]** protocolos y códecs. **[NV]** requisitos para transmitir desde móvil y demoras de activación (la página no los trae) |
| **Twitch** | Ingesta por RTMP; la clave la entrega Twitch en el panel o por API | [Twitch (oficial)](https://dev.twitch.tv/docs/video-broadcast/) | **[V]** RTMP y clave. **[NV]** RTMPS, códecs y límites de bitrate (apuntan a otra guía que no leí) |
| **Kick** | No pude leer su documentación: el sitio bloquea la lectura automática y no la esquivé | n/d | **[NV]** todo |
| **TikTok LIVE** | Desde el teléfono se transmite dentro de la app, sin clave. La clave RTMP se obtiene en computadora y exige un permiso extra que no todas las cuentas con LIVE tienen; mayoría de edad; el umbral de seguidores (1000 según su FAQ) varía por país | Guía de terceros ([streamer.guide](https://streamer.guide/guides/how-to-go-live-on-tiktok)) | **[NV]** no vi la fuente oficial |
| **Instagram Live** | Una guía de terceros indica que hace falta cuenta profesional (Creator o Business) y obtener URL y clave en el sitio de escritorio de Live Producer | Guía de terceros ([Castream](https://help.castream.io/en/help/platform-guides/how-to-stream-to-instagram-live-via-rtmp)) | **[NV]** no vi la fuente oficial ni los requisitos de seguidores |

Consecuencias:
- **YouTube y Twitch** son los destinos realistas para empezar. Instagram y TikTok probablemente exigirán condiciones de cuenta y obtener la clave en una computadora (**[NV]**); si el propietario no puede, la alternativa oficial es transmitir con la cámara dentro de la propia app de la red social y usar AgentCut para grabar y editar.
- **Transmitir a varias plataformas a la vez** se puede hacer de dos formas: varias salidas desde el teléfono (consume mucha subida, batería y calor; **[NV]**) o un servicio intermedio que reenvíe el video (el video sale del teléfono hacia un tercero; requiere permiso explícito del propietario).
- **Grabar mientras se transmite**: RootEncoder lo declara en Android (**[V]** en README); en iOS **[NV]**.
- **Limitaciones de iOS y Android** (segundo plano, batería, datos): **[NV]**, solo se sabrá con pruebas. El SDK ya avisa de límites térmicos y de batería (4).

## 6. Qué se puede hacer ya y qué depende de otras cosas

**Ahora, sin permisos ni computadora** (todo corre en el navegador del iPhone):
- Importar varios videos desde Fotos/Archivos (incluidos los de las gafas, si ya están en Fotos), cortar, poner texto y subtítulos, exportar.
- Chat con la IA que usa la clave de API del propietario y ejecuta operaciones sobre el proyecto, con validador y deshacer.
- Análisis de material con fotogramas y transcripción (con el permiso del propietario para enviar fotogramas y con estimación de costo).
- Teleprompter (issue #7).
- Plan B de exportación con Mediabunny (issue #11).

**Depende de permisos, servicios o experimentos:**
- **Revisar "todos mis videos del viaje":** una web no puede recorrer la fototeca por su cuenta; el propietario tiene que seleccionar los videos. **[NV]** cuántos aguanta el navegador antes de quedarse sin memoria.
- **Cámara de las gafas en vivo:** app nativa + SDK de Meta + modo desarrollador + gafas emparejadas + país compatible. La publicación en tiendas no está abierta.
- **Audio de las gafas en un stream publicado:** experimental, no publicable hoy.
- **Transmitir:** app nativa, y condiciones de cuenta de cada plataforma.
- **Compilar para iPhone sin computadora:** cuenta de Apple Developer (99 USD/año) y compilación en la nube. Es una decisión de dinero que **corresponde al propietario** y solo hace falta cuando lleguemos a las gafas.
- **Meta como proveedor de IA:** vista previa solo en EE. UU. según prensa de julio; **[NV]** el resto (ver `docs/RESOURCES.md`).
- **IA local en el teléfono:** sin medir.

## 7. Siguiente prototipo: "el chat edita de verdad"

Objetivo: demostrar en un iPhone real que **una instrucción en lenguaje natural se convierte en operaciones validadas sobre la línea de tiempo**, que es lo que ningún editor del teléfono hace hoy. Es poco código; no se espera documentación nueva.

**Se construye encima del PR #5** (que sigue sin probarse en un teléfono real):
1. Proyecto en JSON con clips y textos (el PR #5 hoy guarda inicio, fin y texto en variables).
2. Cuatro operaciones: `trim_clip`, `split_clip`, `add_text`, `export`, más `get_state`.
3. Validador (rango, solapes, duración).
4. Panel de chat con un solo proveedor (Claude) y la clave pegada por el propietario, guardada solo en el teléfono.
5. Deshacer.

**Prueba de aceptación, con un clip de 22 segundos, sin computadora:**
1. "Quédate con del segundo 2 al 8 y ponle el texto 'Vancouver' arriba" → el editor aplica las operaciones y la vista previa lo muestra.
2. "Ahora quita el texto y alarga el final dos segundos" → corrige sin empezar de cero.
3. "Recorta hasta el segundo 100" → el validador rechaza, la IA lo ve y propone algo válido.
4. Exportar y abrir el archivo: dura lo esperado, con texto y sonido.

**Bloqueo:** para probarlo en el iPhone hace falta una dirección HTTPS. La forma más simple es **GitHub Pages**, que haría pública una página del repo. Pendiente de la autorización del propietario.

Después, en este orden: análisis de video (issue #6) → segundo proveedor (ChatGPT, issue #8) → exportación con Mediabunny si MediaRecorder falla (issue #11) → teleprompter → puente de gafas (issue #10) → streaming.

## 8. Qué se conserva del trabajo existente

| Trabajo | Qué hacer |
| --- | --- |
| PR #5 (editor web de un clip, ChatGPT) | **Se conserva como base del prototipo.** Falta la prueba en teléfono real antes de fusionar |
| PR #4 (voces abiertas, ChatGPT) | Se conserva para la etapa de voz; no es parte del primer prototipo |
| PR #9 (recursos y guía para IAs, Claude) | Se conserva; este PR corrige la frase "solo web" de `AGENTS.md` y del README |
| PR #12 (gafas y streaming, ChatGPT) | **Se conserva.** Contrasté sus puntos principales con el código: fechas y versiones de DAT 1.0.0 y 1.0.1, lista de funciones experimentales, licencias. Le añado límites de calidad del stream, errores térmicos, versiones antiguas del SDK en FrameFlow y SpecBridge, y el requisito de Mac para iOS |

## 9. Preguntas que decide el propietario

1. ¿Autoriza GitHub Pages para probar la web en el iPhone?
2. ¿Acepta, llegado el momento, pagar la cuenta de Apple Developer (99 USD/año) para instalar la app nativa en su iPhone?
3. ~~Proveedor de IA para el primer prototipo~~ **Respondida:** sin clave por ahora; copiar y pegar con ChatGPT o Claude, y se compara con la prueba de aceptación. (Aviso: Claude tiene sesgo a favor de sí mismo; por eso se mide.)
4. ¿Qué plataformas de transmisión le importan primero? (Se retoma después del editor.) (Recomiendo YouTube y Twitch para empezar, por tener requisitos más claros.)

— Claude
