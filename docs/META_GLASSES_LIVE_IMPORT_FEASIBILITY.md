# AgentCut · repositorios útiles, importación Ray-Ban Meta y transmisión en vivo
**Investigación 2026-10-13 · — ChatGPT**  
**Estado:** investigación; NO implementación, NO prueba en teléfono real, NO decisión del propietario. Complementa [PR #9 de Claude](https://github.com/Os-WHGo/agentcut/pull/9) (recursos generales). M0 (importar, cortar, texto y exportar en una web de teléfono) sigue teniendo prioridad: [PR #5](https://github.com/Os-WHGo/agentcut/pull/5).

## Resumen para la persona propietaria

**Hoy, sin instalar una app propia:** guardar las capturas desde las gafas usando la app Meta AI y seleccionarlas en AgentCut Web desde Fotos/Archivos. Meta confirma que, después de importadas, las capturas están en la fototeca del teléfono ([Meta, julio 2026](https://about.fb.com/news/2026/07/metas-ai-glasses-your-questions-answered/); [FAQ Ray-Ban](https://www.ray-ban.com/usa/c/frequently-asked-questions-ray-ban-meta-smart-glasses)). El usuario ya graba con Ray-Ban Meta; esta opción no necesita ordenador para **usar** el editor web publicado. Aún no está probada de extremo a extremo en AgentCut.

**Directo a cámara / en vivo:** el SDK **Meta Wearables Device Access Toolkit (DAT) 1.0** permite que apps nativas de iOS/Android reciban video de gafas ([FAQ Meta](https://developers.meta.com/wearables/faq/), [iOS](https://github.com/facebook/meta-wearables-dat-ios), [Android](https://github.com/facebook/meta-wearables-dat-android)). **No otorga esa cámara a una web normal en Safari/Chrome.** La ruta futura es una aplicación puente opcional, separada de la web, que reciba o guarde video y, si se autoriza, lo publique en directo.

**Transmisión a terceros:** enviar video a Twitch/YouTube/Instagram, por definición, **sí sale del teléfono**. Ofrecerlo solo en un modo opt-in separado, con aviso visible, clave de retransmisión protegida, botón de detener y confirmación. La política final la decide el propietario; no incluir retransmisión silenciosa.

## 1. Repositorios oficiales Meta

| Repositorio | Para qué | Licencia verificada en repo | Estado |
| --- | --- | --- | --- |
| [facebook/meta-wearables-dat-ios](https://github.com/facebook/meta-wearables-dat-ios) | SDK iOS, acceso a stream de cámara y ejemplos que registran video con audio opcional | **Developer Terms de Meta**, NO licencia libre OSI (archivo [LICENSE](https://github.com/facebook/meta-wearables-dat-ios/blob/main/LICENSE)) | **Verificado (repositorio, licencia y [ejemplo CameraAccess](https://github.com/facebook/meta-wearables-dat-ios/tree/main/samples/CameraAccess)).** Integración iPhone real NO verificada |
| [facebook/meta-wearables-dat-android](https://github.com/facebook/meta-wearables-dat-android) | SDK Android + ejemplo CameraAccess y Mock Device Kit | **Developer Terms de Meta**, NO licencia libre OSI ([LICENSE](https://github.com/facebook/meta-wearables-dat-android/blob/main/LICENSE)) | **Verificado:** existe SDK y ejemplo. Android real NO probado |
| [iSee-Labs/meta-wearables-dat-flutter](https://github.com/iSee-Labs/meta-wearables-dat-flutter) | Wrapper multiplataforma Flutter sobre SDK nativos | **MIT para wrapper**; SDK de Meta mantiene sus términos | **Verificado:** repositorio/licencia/README. No es web; hardware NO probado por AgentCut |

**Fecha/versiones verificadas:** [changelog oficial iOS](https://github.com/facebook/meta-wearables-dat-ios/blob/main/CHANGELOG.md) marca **DAT 1.0.0 (24 sept 2026)** y **1.0.1 (9 oct 2026)**. Meta dice que la serie estable empezó a distribuirse el **30 sept 2026** ([FAQ](https://developers.meta.com/wearables/faq/)). Los READMEs aún usan a veces texto de «developer preview»: tomar la versión del changelog, no de ese texto antiguo.

**Restricción:** varias capacidades añadidas en 1.0 son **experimentales** y según Meta no se pueden publicar aún en apps de producción: audio PCM sincronizado en stream, foto individual de alta calidad, voz/activación por voz, sensores. El video de cámara y el ejemplo de grabación existen, pero no asumir que el **audio nativo de las gafas** está liberado para una app pública. Verificar capacidad por función antes de publicar. Fuente: [changelog iOS 1.0](https://github.com/facebook/meta-wearables-dat-ios/blob/main/CHANGELOG.md).

**Requisitos antes de usar SDK nativo:** app Meta AI y gafas emparejadas, registro de proyecto, modo desarrollador, permisos, región admitida y aceptación de términos. Requiere instalación de una app nativa. **iOS:** para crear/probar una integración propia normalmente se necesita Xcode en macOS y firma/instalación; puede explorarse compilación en nube, pero no elimina automáticamente requisitos de firma y distribución. **Android:** IDE Android o CI y APK firmado/instalado; las compilaciones en GitHub Actions son una opción por verificar.

## 2. Importar grabaciones previas (sin acceso directo a la memoria de las gafas)

**Verificado:** Meta afirma que los videos grabados por las gafas se guardan en ellas hasta que se importan mediante Meta AI; después quedan en la galería/fototeca del teléfono ([Meta](https://about.fb.com/news/2026/07/metas-ai-glasses-your-questions-answered/), [Ray-Ban](https://www.ray-ban.com/usa/c/frequently-asked-questions-ray-ban-meta-smart-glasses)). **Flujo inmediato para AgentCut Web:**

`Gafas (grabación original) → Meta AI (importar/sincronizar) → Fotos/Archivos del teléfono → <input type=file accept=video/*> de AgentCut → edición local`.

**No verificado:** una API pública de DAT 1.0 para listar/descargar grabaciones antiguas directamente del almacenamiento de las gafas. En la [discusión oficial #28](https://github.com/facebook/meta-wearables-dat-ios/discussions/28) (dic 2025) una persona pidió esa API y un representante de Meta respondió que la consideraban; el changelog de 1.0 no enumera tal acceso. **No concluir que sea imposible para siempre.** Investigar permisos de biblioteca de fotos solo para el puente nativo futuro, evitando lectura masiva sin permiso.

**Entrada directa desde compartir de iOS a PWA:** no contar con un destino nativo de la hoja Compartir de iOS Safari sin verificar su disponibilidad. **Selección desde Fotos/Archivos en la página** es el flujo que debemos probar primero.

## 3. Repositorios de retransmisión desde gafas (NO confundir ejemplo con app probada)

| Repositorio | Sistema, capacidad declarada | Licencia | Valor / límites |
| --- | --- | --- | --- |
| [KilimcininKorOglu/FrameFlow](https://github.com/KilimcininKorOglu/FrameFlow) | Android/Kotlin; recibe video de Ray-Ban Meta mediante DAT; declara grabación local y RTMP a Twitch, YouTube, Kick, Facebook, TikTok | **MIT verificado** | Código Android existente; README dice **DAT SDK 0.2.1**, desactualizado frente a DAT 1.0. Rendimiento, plataformas y sonido **NO verificados en hardware**. Evaluar ideas de pipeline, no asumir compatibilidad |
| [sashimi0/specbridge](https://github.com/sashimi0/specbridge) | iOS/Swift; puente de fotogramas DAT hacia Twitch RTMP | **MIT verificado** | Código en StreamManager.swift / SpecBridge.swift utiliza DAT + HaishinKit. Twitch hardcoded y APIs antiguas: **actualización a DAT 1.0 y compilación NO verificadas** |
| [HaishinKit/HaishinKit.swift](https://github.com/HaishinKit/HaishinKit.swift) | iOS; RTMP/SRT, codificación y publicación en vivo | **BSD-3-Clause verificado** | Motor genérico para futura app puente iOS; **no** conecta gafas por sí solo |
| [HaishinKit/HaishinKit.kt](https://github.com/HaishinKit/HaishinKit.kt) | Android; RTMP | **BSD-3-Clause verificado** | Motor genérico para Android; **no** conecta gafas por sí solo |
| [Bluecoolclouds/Meta_RayBan_ai_glasses](https://github.com/Bluecoolclouds/Meta_RayBan_ai_glasses) | Android DAT + Gemini Live + streaming Twitch, según README | **SIN LICENSE identificada en raíz: derechos de reutilización NO verificados** | Solo estudio conceptual, **no copiar código** antes de tener licencia válida |

**Precaución clave:** el SDK de Meta entrega video en formatos específicos y el servicio RTMP necesita codificar video H.264/audio AAC (según destino). El ejemplo [discusión oficial #126](https://github.com/facebook/meta-wearables-dat-ios/discussions/126) identifica el problema de transformar RAW/HEVC a H.264. No dar por probado que la implementación capture micrófono de las gafas en DAT 1.0 para publicación: la función de PCM directo es experimental. Capturar audio vía Bluetooth tiene restricciones específicas por OS y modelo; probar aparte.

## 4. Repositorios web para que AgentCut importe, corte y exporte mejor

No reemplazar M0 sin prueba real en iPhone. Complementa recursos ya recopilados por Claude en [PR #9](https://github.com/Os-WHGo/agentcut/pull/9).

| Repositorio | Uso potencial | Licencia repo | Evidencia y limitación |
| --- | --- | --- | --- |
| [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) | MP4/MOV, corte, conversión y exportación local con WebCodecs | **MPL-2.0 verificada** | README/API lo documentan; **exportación Safari iPhone no verificada**. Prima para plan B de PR #5 |
| [WebAV-Tech/WebAV](https://github.com/WebAV-Tech/WebAV) | SDK de edición basado en WebCodecs, composición y exportación | **MIT verificada** | Su README prioriza Chrome/Edge; **Safari iPhone no verificado** |
| [ericjay5621/webav-video-editor](https://github.com/ericjay5621/webav-video-editor) | Editor React con texto, clips y MP4 como **referencia** de flujo | **MIT verificada**, dependencias separadas | README lo recomienda para Chrome/Edge de escritorio y advierte que móvil/Safari NO garantizado |
| [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | Fallback de procesamiento WASM en navegador | **MIT del wrapper verificada**; FFmpeg compilado puede tener obligaciones LGPL/GPL según configuración | Pesado para Safari móvil; memoria/rendimiento NO verificados; no instalar por defecto |
| [katspaugh/wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) | Mostrar forma de onda y seleccionar silencios en interfaz táctil | **BSD-3-Clause verificada** | Uso para análisis visual de audio; pruebas táctiles iPhone pendientes |
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | Modelos IA en navegador, transcripción o clasificación | **Apache-2.0 del runtime verificada**; modelos con licencias propias | Descargar/ejecutar modelos en Safari, rendimiento NO verificado |
| [naptha/tesseract.js](https://github.com/naptha/tesseract.js) | OCR de letreros/texto en fotogramas localmente | **Apache-2.0 verificada**; datos de idioma separados | Extracción de fotogramas y rendimiento iOS por probar |

**No confundir** licencias de repositorio con las de cada modelo, compilación binaria o archivo de medios. Las APIs nativas del sistema (WebCodecs, Canvas, MediaRecorder) no requieren clonar un editor propietario. **En particular**: MPL-2.0 exige compartir modificaciones propias a archivos Mediabunny que se distribuyan; no significa que toda AgentCut deba ser MPL.

## 5. Tres propuestas de integración, con ventajas y costes

| Ruta | Resultado | Ventajas | Limitación |
| --- | --- | --- | --- |
| **A. Solo web + Meta AI (primero)** | Fotos/videos grabados → importación manual o auto por Meta AI → elegir en AgentCut | Sin instalar app adicional, compatible con filosofía web, archivos originales se mantienen locales | No accede directamente a galería interna de gafas ni recibe cámara en vivo |
| **B. Puente nativo opcional, guardar al teléfono (después)** | Gafas en vivo → DAT app iOS/Android → guardar en Fotos/Archivos → AgentCut Web | Permite capturar nuevo material y aprovechar ejemplos oficiales | Requiere app nativa, firma, SDK Meta; audio/video/developer terms y compatibilidad por verificar |
| **C. Puente nativo a LIVE externo (investigar)** | Gafas → DAT → codificador/RTMP → destino de live, copia local opcional | Permite transmitir a plataformas con ingest permitido | Sale video por internet, consume datos/batería, permisos y claves de stream, audio experimental, publicación y cuentas según plataforma |

**Opción futura de live en AgentCut Web:** puente nativo que entregue vista previa a un WebView/WebRTC o interfaz web local. No hay hoy un diseño verificado de conexión segura ni pruebas Safari/Android. No anunciar «directo desde Safari a la cámara de Meta». El streaming de gafas al móvil **no** implica automáticamente emisión a una red social.

## 6. Plan corto de verificación, sin computadora para usuario final de la web

1. **M0** (bloqueante): propietario prueba [PR #5](https://github.com/Os-WHGo/agentcut/pull/5) en iPhone con video corto importado desde Fotos, recorte, texto y exportación; registrar problemas de sonido.
2. **Importación Meta**: usar un clip recién importado desde Meta AI, seleccionarlo desde Fotos en AgentCut Web. Anotar formato, orientación, sonido, tamaño y si conserva metadatos; no subir material privado.
3. **Plan B exportación**: si MediaRecorder falla, comparar una prueba mínima de Mediabunny vs WebAV con exactamente el mismo clip y navegador. Elegir por resultado, no por estrellas.
4. **Investigación puente**: revisar muestra oficial CameraAccess DAT 1.0, luego comparar FrameFlow (Android) y SpecBridge (iOS) por API actual y licencias. El propietario decide si acepta app nativa adicional y qué modo LIVE desea.
5. **Vivo opcional:** antes de prometer, comprobar en hardware consentimiento, audio, LED de grabación, estabilidad, duración, temperatura, consumo de datos, permisos de Meta y restricciones de cada plataforma de streaming. No asumir emisión pública autorizada.
6. **Guías para IAs**: compartir este documento con Claude y otros colaboradores vía PR en borrador. No hacer merge a `main`.

## Cambios y obligaciones legales

- Este PR **solo añade investigación original**, enlaces y propuestas; **ningún código de terceros** se copió al proyecto.
- No copiar imágenes, nombres comerciales ni UI de CapCut u otras apps propietarias. Respetar SDK Meta bajo sus términos.
- La retransmisión en directo exige señalización de grabación y respeto a privacidad de terceros; las funciones de cámara de gafas usan indicadores de captura establecidos por Meta.
- Fuentes verificadas: metadata/licencia de repositorios oficiales indicados, [Meta FAQ](https://developers.meta.com/wearables/faq/), [DAT changelog 1.0](https://github.com/facebook/meta-wearables-dat-ios/blob/main/CHANGELOG.md), [Meta capturas](https://about.fb.com/news/2026/07/metas-ai-glasses-your-questions-answered/), [discusión sobre importar originales](https://github.com/facebook/meta-wearables-dat-ios/discussions/28) y [formato de streaming](https://github.com/facebook/meta-wearables-dat-ios/discussions/126). Hardware de usuario y viabilidad de todo el flujo web+nativo: **NO verificados**.

**Próximo paso recomendado:** primero probar M0 en Safari; esta investigación queda lista para que Claude seleccione un experimento de puente sin duplicar el [PR #9](https://github.com/Os-WHGo/agentcut/pull/9).

— ChatGPT
