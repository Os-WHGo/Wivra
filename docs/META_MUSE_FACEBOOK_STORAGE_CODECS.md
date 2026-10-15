# AgentCut · Muse/Meta AI + Facebook LIVE + grabación eficiente
**2026-10-13 · propuesta documentada por ChatGPT**  
**Estado:** NO implementado; propuesta para decisión del propietario y revisión de Claude. Complementa [STREAMING_AGENT_AND_AUTO_HIGHLIGHTS.md](STREAMING_AGENT_AND_AUTO_HIGHLIGHTS.md) y [PR #13 de arquitectura de Claude](https://github.com/Os-WHGo/agentcut/pull/13). No fusionar a `main`.

## 1. Aclaración de visión: editor + agente streaming, sin encerrarlo en un proveedor

El propietario quiere AgentCut **para teléfono, compatible con IA de OpenAI, Claude y Meta/Muse, extensible a otras**. Durante el LIVE: Ray-Ban Meta/cámara → destinos autorizados, incluidos **Facebook Live**, Instagram, TikTok, YouTube, Twitch, Kick y otros con ingest documentado. Al finalizar, **el video completo debe estar guardado localmente**, listo para analizar y proponer momentos para Reels/Shorts/TikTok/historias.

La arquitectura **web vs híbrida vs nativa no está decidida**; web-only fue una interpretación de colaboradores, no una decisión del propietario. Las gafas vía DAT requieren SDK **nativo** para cámara en directo; el primer editor web sigue siendo útil como prueba aislada.

## 2. Proveedores: separar modelo Muse, producto Muse y Meta AI

| Integración | Fuente y estado verificado | Lo que NO debemos prometer |
| --- | --- | --- |
| **Meta Model API / Muse Spark** | [Meta Model API](https://dev.meta.ai/docs/overview) documenta API compatible con OpenAI SDK y otras superficies, tool calling y pago por uso | Que una cuenta gratuita de Meta AI permita llamar ese API sin clave/costo |
| **Meta Model API / Muse Wonder** | Meta anunció **Muse Wonder y Muse Wonder Full el 12 oct 2026**: [anuncio oficial](https://about.fb.com/news/2026/10/introducing-muse-wonder-models/). [Documentación oficial](https://dev.meta.ai/models/muse-wonder) indica modelo API `muse-wonder-1.0` (vista previa, facturación por tokens) | **Muse Wonder Full** no figura como API general: disponible por suscripción de Muse Code, no equivale a `muse-wonder-1.0` |
| **Muse (app/asistente Meta) y Meta AI (producto consumidor)** | Meta distingue aplicaciones de usuario, Muse Code y Meta Model API (ver enlaces anteriores) | No se confirmó que sus chats expongan a cualquier tercero un conector/SDK que pueda controlar AgentCut; investigar cada ruta y permisos en lugar de inventar un «login gratis» |
| **OpenAI/ChatGPT, Claude y futuras IA** | La arquitectura neutral de AgentCut permite adaptadores, sujetos a API, claves y costos separados | Una suscripción al chat NO garantiza acceso a APIs de terceros ni uso automático de las memorias/conversaciones |

**Contrato único de AgentCut:** `providerCapabilities` (toolCalling, vision, audio, costEstimate, authMethod, privacyTerms); `modelId` sin codificar nombres fijos en el motor; misma lista `project_* / edit_* / stream_* / highlights_*` para todas las IA. Si un proveedor no tiene integración verificada, mostrar «no disponible», no simular capacidades. Guardar credenciales en almacenamiento seguro nativo cuando se disponga, nunca en repositorio ni logs. Validación del plan e intervención explícita del usuario para arrancar LIVE o publicar clips.

**Privacidad/costos:** la IA puede recibir transcripciones, timecodes y metadatos, con consentimiento. El video completo permanece local salvo subida opcional autorizada. APIs comerciales de Muse/ChatGPT/Claude pueden ser pagadas; los motores locales de voz gratuitos del PR #4 son **un requisito de experiencia distinto**, sujeto a elección final del propietario.

## 3. Destinos de streaming extensibles, con Facebook Live

Una interfaz de «Destinos» extensible y orientada a capacidades, **no cinco plataformas codificadas para siempre**:

- **Facebook Live**: investigar conexión por Live Producer (URL RTMPS y clave); ver [documentación técnica de Restream para eventos Facebook, marzo 2026](https://support.restream.io/en/articles/5012472-stream-to-an-existing-facebook-event) y [guía StreamYard, enero 2026](https://streamyard.com/pt-pt/blog/how-to-connect-streaming-software-to-facebook). Las páginas oficiales de ayuda de Facebook exigen sesión para consultar varios detalles; por tanto el **nivel de elegibilidad de cuenta, API OAuth oficial, emisión a perfil/página/grupo y cambios de permisos siguen NO verificados**.
- **YouTube Live**: [requisitos oficiales de encoder](https://support.google.com/youtube/answer/2853702?hl=en). H.264/H.265/AV1 en modos admitidos, RTMP/RTMPS y audio AAC; no extrapolar codecs a otras plataformas.
- **Twitch**: [guía de emisión](https://help.twitch.tv/s/article/broadcasting-guidelines?language=es), preferir inicialmente configuración compatible H.264 + AAC.
- **Kick**: [guía oficial](https://help.kick.com/en/articles/7066931-how-to-stream-on-kick-com) con datos de servidor/clave, revisar requisitos de cuenta.
- **TikTok LIVE**: acceso de cuenta y modalidad para codificadores externos sujetos a disponibilidad. No todos tienen URL/stream key; no usar APIs privadas ni bypass.
- **Instagram Live**: soporte por Live Producer para cuentas elegibles y claves/RTMP cuando se habilitan; autenticación para terceros y acceso directo desde móvil NO verificados. No confundir integración Meta AI/Muse con permiso de emitir a Instagram/Facebook.
- **Otros**: adaptador `custom-rtmps` **solo** cuando el destino autoriza emisión mediante servidor y clave, con prueba de conexión y aviso de riesgos. Opcional relay multi-stream: ver [MediaMTX](https://github.com/bluenviron/mediamtx) (**MIT de repo, verificada**) y [SRS](https://github.com/ossrs/srs) (**MIT de repo, verificada**). Aunque el software sea abierto, el hosting y ancho de banda pueden costar.

**Contrato futuro de destino propuesto** (no implementado):
```json
{
  "platform": "facebook|instagram|tiktok|youtube|twitch|kick|custom",
  "connected": false,
  "accountEligible": "unknown",
  "authMethod": "oauth|stream_key|none",
  "ingestProtocol": "rtmps",
  "videoCodecs": ["h264"],
  "audioCodecs": ["aac"],
  "maxResolution": null,
  "maxFps": null,
  "supportsMultistream": "unknown",
  "requiresConfirmation": true,
  "documentationUrl": ""
}
```
Los valores de capacidades deben obtenerse de pruebas y documentación vigentes, no adivinarse; los códecs de ejemplo **no son una matriz de compatibilidad verificada para Facebook/TikTok/Instagram**.

## 4. Grabación local con poco espacio, conservando calidad

**Separar dos productos multimedia que tienen exigencias distintas:**

| Salida | Elección inicial propuesta | Por qué |
| --- | --- | --- |
| **Flujo de emisión** | **H.264 video + AAC audio**, RTMPS cuando el destino admita esta combinación | Compatibilidad y baja latencia entre destinos; el bitrate debe seguir reglas de cada plataforma, no el del archivo local |
| **Copia local pos-LIVE** | **HEVC/H.265 + AAC en MP4/fMP4** si hay codificador **hardware** disponible y rendimiento suficiente; alternativa H.264/AAC | HEVC comprime más por tamaño similar de imagen: [Apple HEVC](https://support.apple.com/en-ca/101939) documenta «hasta 40 % menor» vs H.264 en ciertas pruebas, NO es garantía |
| **Archivos fuente ya comprimidos** | Remux/copy sin recodificar cuando el formato, los permisos y los tiempos lo permitan | Evita pérdida generacional, calor, batería y duplicar archivos. No deducir que un stream DAT pueda guardarse sin transformar |
| **Clips derivados** | Exportar **solo cortes elegidos**, a ratio/resolución/codec compatibles con destino, sin duplicar todo el directo | Preservar original y permitir variantes 9:16, 16:9, historia, subtítulos |

**Si el teléfono no soporta de manera sostenible dos encoders simultáneos**, preferir **grabar localmente el mismo H.264 de la transmisión (sin segunda codificación) antes que sacrificar estabilidad**. La alternativa más comprimida (HEVC) se puede generar *después* del LIVE, solo si el usuario la solicita y hay espacio/energía disponible. También hay dispositivos con AV1 hardware: investigarlo como alternativa futura, no valor predeterminado. Un formato no debe romper la edición ni la reproducción.

**Tres presets propuestos, nunca promesas absolutas:** `Ahorro`, `Equilibrado` (predeterminado a evaluar), `Calidad`. El usuario podrá ver resolución, FPS, codec, tasa de bits y **estimación de tamaño** antes de grabar; la tasa debe adaptarse al movimiento, oscuridad, ruido visual y límites reales del dispositivo y el origen. No «4K» si la señal de las gafas solo entrega 720p. Para transmisiones usar parámetros compatibles y bitrates recomendados por el destino (YouTube publica rangos por resolución/FPS), con comprobación de subida móvil.

**Grabación robusta (propuesta de ingeniería):**
1. El archivo local se escribe **durante** la transmisión, no se descarga después desde Twitch/Meta/etc.
2. Guardar partes recuperables de longitud limitada (a evaluar, por ejemplo 30–120 segundos), manifest con timestamps monotónicos, origen y checksums; al detener, finalizar/ensamblar un índice sin recodificar si es viable.
3. No borrar la copia local hasta comprobar que está finalizada, que video/audio se reproducen y que el usuario consintió borrarla. Ante disco lleno, advertir; registrar con seguridad errores y priorizar detener/suspender grabación o emisión según política aprobada y opciones del usuario, sin ocultarlo.
4. Medir espacio, bitrate real, duraciones, fotogramas perdidos, sincronización A/V, batería y térmicas en **iPhone y Android reales**; si se cambia encoder, volver a medir.
5. Por privacidad, ninguna sincronización automática a la nube y no almacenar RTMP keys en el manifiesto o el proyecto.
6. Después del LIVE, el agente de highlights lee **el archivo local** y presenta candidatos con timecode/verificación y formatos sociales; no crea sugerencias de material que nunca se grabó.

**Importante sobre licencias:** Los encoders hardware del SO no equivalen a «un proyecto de código abierto»; HEVC es un estándar con posibles obligaciones de patentes para implementaciones/distribución. Auditar dependencias, patentes/licencias y condiciones del SDK Meta antes de una publicación comercial. No incorporar binarios, SDKs ni código ajeno sin revisar sus términos.

## 5. Plan verificable propuesto para Claude y el propietario

1. **E0:** con clip de archivo local, comparar H.264 y HEVC en un **mismo teléfono y contenido**: tamaño, calidad observada, tiempo, batería, audio, compatibilidad. Investigar remux sin recodificación; nada requiere gafas para esta prueba.
2. **E1:** grabación local segmentada 5 minutos con cámara del móvil y archivo reproducible aunque se corte la conexión. Probar si la ruta de almacenamiento requiere app nativa.
3. **E2:** emisión aprobada a **un solo destino** (p. ej. YouTube/Kick/Twitch o Facebook según cuenta) + grabación local al mismo tiempo; validar integridad sin simulación.
4. **E3:** integrar DAT con las Ray-Ban Meta, permisos y audio permitido; evaluar límites publicados del SDK, temperatura y formato de fuente.
5. **E4:** indexar grabación E2/E3, producir 3 highlights con tiempos reales, mostrar vista previa y exportar Reel/Shorts sin cambiar el original.
6. **E5:** Muse Spark/Wonder vía Meta Model API, OpenAI y Claude como opciones de IA de planificación; probar que producen operaciones tipadas idénticas sin filtración de material; estimar gastos **antes** de enviar solicitudes.
7. **E6:** Facebook Live y otros destinos en matriz verificada por plataforma/cuenta, multistream por relay opcional; nunca habilitar TikTok/Instagram si la cuenta no dispone de acceso.

**Orden por decidir.** Aprovechar [PR #5 de editor](https://github.com/Os-WHGo/agentcut/pull/5), [PR #13 arquitectura de Claude](https://github.com/Os-WHGo/agentcut/pull/13) y este PR sin duplicar trabajo. No comprometer la arquitectura web-only. Claude coordina la revisión cuando el propietario lo solicita; ChatGPT aporta esta propuesta en PR de borrador, sin merge.

**Verificado:** anuncio 2026-10-12 de Muse Wonder; API de Muse Wonder y Spark según Meta; licencias de MediaMTX/SRS; Apple sobre ventaja de HEVC; YouTube/Twitch especificaciones generales de encoder; documentación de ejemplos Facebook de terceros.  
**No verificado:** compatibilidad final de Ray-Ban Meta en AgentCut; permisos de Facebook Live de cada cuenta, acceso del producto Meta AI/Muse como conector dentro de app, funcionamiento simultáneo de dos encoders en iPhone/Android, tamaño y calidad real en el hardware del propietario, audiencia multiplataforma.

— ChatGPT
