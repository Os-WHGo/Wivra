# WIVRA · Plan maestro unificado: editor completo + IA + cámaras + LIVE
Fecha de decisión: 13 octubre 2026. Estado: PLAN/INVESTIGACIÓN; no representa funcionalidades ya terminadas.

## 0. Intención real y reglas innegociables

**Producto único:** Wivra aspira a la amplitud funcional y facilidad de un editor tipo CapCut, con operaciones avanzadas inspiradas por herramientas profesionales como Premiere, y con una mejora distintiva: IA que **entiende el material real** y puede aplicar ediciones comprobables. Incluye grabación desde cámara de iPhone y cámaras externas (prioridad Ray-Ban Meta), importación de archivos y URLs autorizadas, y LIVE en plataformas múltiples (prioridad YouTube, luego destinos habilitados).

**No es** una simple demo de recortes ni solo un capturador Ray-Ban. No crear segundo editor, no abandonar el editor manual, no hacer una copia visual literal de CapCut ni usar iconos, logos, assets Pro, fuentes, packs de efectos o código propietario sin licencia.

Decisiones previas preservadas: una sola app, iPhone primero, Android y tablet después; vídeos originales intactos; local-first cuando sea posible; editor manual completo con IA opcional; Ray-Ban cámara y audio seleccionable; pistas audio independientes y MOV derivado; receptor USB multicanal opcional; archivos externos sincronizables; no modo DJ especializado; no fusionar ramas a `main` sin permiso.

## 1. Diagnóstico del estado real

**Editor Claude:** [PR #44](https://github.com/Os-WHGo/Wivra/pull/44) ofrece prototipo de timeline, importación básica multivideo, recorte/split/reorder, texto, controles de audio por clip, una representación visual de audio bajo el video, undo/redo, exportación experimental desde el navegador y operaciones IA validadas. El usuario probó ciertas operaciones en iPhone, pero no se considera producto completo. NO están verificados como sistema final: biblioteca multipista arbitraria, máscaras/chroma key, compositor multicapa, transiciones completas, subtítulos profesionales, compatibilidad larga duración en iPhone, importación de sidecars `.wivra.json`, IA analizando clips reales de punta a punta y exportación escalable.

**Captura ChatGPT:** [PR #51](https://github.com/Os-WHGo/Wivra/pull/51) encima de [#50](https://github.com/Os-WHGo/Wivra/pull/50) y [#48](https://github.com/Os-WHGo/Wivra/pull/48): prototipo iOS DAT/HEVC + entrada de audio elegible y validada + CAF + MOV combinado + manifiesto multipista v2. CI Xcode sin firma y Node completado; NO validado en Ray-Ban físicas/iPhone, audio USB de dos canales, sincronía con medición real ni compatibilidad de transmisión. No hay LIVE RTMP/RTMPS operativo todavía.

**Meta AI:** [Drive investigación]([enlace retirado]) con 6 documentos revisados. Investigación no reemplaza pruebas de hardware ni amplía automáticamente el alcance. **Corrección de actualidad:** la [FAQ oficial de Meta](https://developers.meta.com/wearables/faq/) declara que DAT 1.0 estable comenzó a desplegarse 30-sep-2026. Revisar SDK y publicación específica por capacidad, modelo y país; NO seguir etiquetando todo el SDK como Developer Preview por documentos antiguos.

## 2. Candidatos de código abierto: auditar y REUTILIZAR antes de reinventar

**Candidato A / primera prueba de motor completo: [Augani/openreel-video](https://github.com/Augani/openreel-video)**.
- Repo verificado abierto y no archivado; `LICENSE` MIT, copyright 2024-2026 Augustus Otu y colaboradores, comprobado con GitHub.
- Su README describe timeline multipista, keyframes, efectos/color/LUT, mezcla y formas de onda, subtítulos, composición, exportación y bibliotecas separadas core/UI/agent. Son *declaraciones del upstream*, no pruebas en nuestro iPhone. Probar desempeño real, exportación, formatos, modelos y licencias transitivas.
- Ventaja potencial: mayor cobertura de editor antes de añadir IA propia; riesgo: dependencias, WebCodecs/WebGPU y adaptación táctil/Safari.

**Candidato B / comparación de UX y alternativa MIT: [OpenCut-app/opencut-classic](https://github.com/OpenCut-app/opencut-classic)**.
- Licencia MIT verificada; **archivado y sin mantenimiento desde 17-may-2026**. Claude ya investigó código/UX y parche de botón `+` táctil en [PR #34](https://github.com/Os-WHGo/Wivra/pull/34), pero el control total de línea de tiempo con dedos y exportación iOS real no están demostrados.
- Puede inspirar biblioteca, timeline, herramientas, flujo de capas o dar código atribuible, pero no comprometer arquitectura sin benchmark.

**Candidato C / seguimiento de futuro: [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut)**.
- Repo activo MIT; README habla de futuro editor API, MCP, plugins y motor Rust para móvil/desktop/web, **una reescritura en curso**, no funcionalidad lista. No basar cronograma en promesas.

**No importar código sin revisión**:
- [Concat](https://github.com/neri2tech/Concatvideoeditor) es **AGPL-3.0** según su archivo `LICENSE`; no trasplantar su código a Wivra MIT sin análisis jurídico y obligaciones de copyleft. Se permite investigar ideas funcionales.
- `designcombo/react-video-editor` redirige a `openvideodev/react-video-editor`; licencia de redistribución/comercial no verificada claramente: bloquear copia hasta revisar términos actuales y dependencias.
- Twick tiene licencia SUL con restricciones específicas: requiere revisión para redistribución antes de usar.
- Premiere y CapCut son referencias de características/usabilidad, **no** repos de código libre para clonar.
- **Regla general:** uso de código de terceros bajo licencia aplicable, mantener copyright y avisos, auditar paquetes, assets, patentes/códecs, seguridad y privacidad. MIT del repositorio superior no garantiza licencia MIT para todos sus recursos.
- Esta investigación no ha clonado aún ninguno a Wivra ni sustituido el motor de Claude.

### Protocolo explícito para Claude: clonar sin poner en riesgo Wivra
1. Crear entorno de evaluación aislado FUERA del repositorio de trabajo o directorio `spikes/` gitignored en una rama exclusiva:
   `git clone --depth 1 https://github.com/Augani/openreel-video.git /tmp/wivra-spikes/openreel`
   `git clone --depth 1 https://github.com/OpenCut-app/opencut-classic.git /tmp/wivra-spikes/opencut-classic`
   Preferir commit SHAs fijos en informe para reproducibilidad. No clonar CapCut/Premiere comerciales ni forks opacos por nombre similar.
2. Inspeccionar `LICENSE`, package-lock/pnpm-lock, dependencias, scripts de instalación, nombres y licencias de assets. **Antes de ejecutar scripts de repos externos**, revisar operaciones de instalación/postinstall y seguridad del entorno. Después ejecutar tests/build provistos usando instrucciones de cada upstream. No ejecutar sin inspección comandos de fuentes no confiables.
3. Evaluar EN PARALELO a nuestro editor actual sobre los mismos clips y escenario, primero Chromium emulando móvil, luego Safari iPhone real: pantalla táctil, importación HEVC/MOV/MP4, 3-5 clips, 2 audios simultáneos, captions, máscaras, keyframes, exportación MP4, uso de memoria y estabilidad, modo offline, tiempo de primer preview y opciones de IA.
4. Crear matriz de **FUNCIONA / PARCIAL / NO / SIN PROBAR** con capturas de pantalla *propias* y evidencia reproducible, y un PR **solo de evaluación**. No afirmar que el README = funcionalidad comprobada.
5. Decidir con el propietario si: (A) Wivra adopta/forkea el motor completo, (B) se integran módulos permitidos, o (C) se mantiene motor actual mejorándolo. Todo debe conservar adaptadores de IA, contrato de proyecto, importación y captura. **No reemplazar/eliminar `core/` o `app/` antes de esta decisión.**

## 3. Matriz objetivo de funciones tipo CapCut, sin prometer que estén hechas

**P0 (editor viable, obligatorio):**
- Biblioteca de importación: Fotos/Archivos (iPhone), clips de iPhone/Meta/GoPro, audio local externo; HEVC/MOV/MP4 con advertencias de códec, vista previa real, miniaturas.
- Proyecto guardable/restaurable con referencias persistentes a medios, undo/redo, cortes precisos, split, trim, reorder, ripple delete, snap, scrub suave, zoom, duplicar clip, ajustar velocidad, rotación/crop, ratios 9:16/16:9/1:1.
- **Timeline multipista REAL**: video y audio independientes, mover cada pista en tiempo, sincronización manual por offset/palmada, mute, volumen, fade, cortar/estirar audio, importar música/voz; mezcla coherente en preview y export.
- Textos y títulos editables, subtítulos SRT/VTT y opcional autotranscripción, estilos tipográficos propios, efectos básicos de video/audio, transiciones comunes.
- Exportación funcional desde iPhone (no solo Chromium simulado), video y sonido correctos, 720p/1080p cuando dispositivo lo permita, progreso/cancelación, conservación de originales.
- Herramientas IA deben generar operaciones validadas, ver antes/después, aceptar/rechazar, deshacer.

**P1 (cobertura para acercarse a CapCut):**
- Video sobre video/imagen/overlay, resize/position por gesto, PIP, chroma key, máscara, keyframes, control de opacidad, stickers legalmente propios, speed ramps, estabilización cuando viable, corrección de color/LUT, EQ de audio, reducción ruido, visualización de forma de onda, voz en off grabable, proxy/cache, plantillas originales.
- Detección de cortes/escenas, highlights, subtítulos alineados por palabra, traducción/captions, auto-reframe, borrado de silencios, presets para Reels/TikTok/Shorts.

**P2 (avanzado, no bloquear P0):**
- Motion tracking, interpolación, composiciones complejas, subtítulos estilizados, sincronía automática por forma de onda, multicámara, HDR/proxy 4K, plugins, colaboración, avatar/CG, automatización profesional.
- No comprometer identidad de marcas ni forzar modelos premium de pago.

## 4. IA: ¿qué significa que realmente *entienda*?

El editor debe ser plenamente utilizable SIN IA. Con IA:
1. Indexar medios con consentimiento: duración, orientación, audio/transcripción, keyframes/miniaturas, escenas y metadatos, sin inventar contenido.
2. El usuario puede decir: «estos son mis 40 videos de Vancouver; crea un Reel de 45 s con el momento del reloj, luego el bus y música baja bajo mi voz». IA identifica coincidencias con fotogramas/transcripción, indica incertidumbres, propone lista de planos con tiempos y realiza **operaciones reales** mediante el mismo motor que usa la UI.
3. Revisiones conversacionales («reduce la toma 3», «sube solo la voz», «pon subtítulos», «no uses ese clip»). Exponer operaciones `media_import`, `asset_analyze`, `timeline_add/move/split/trim`, `audio_track_add/gain/mute/offset`, `caption_create`, `export_run`, etc. Validación, permisos, logs, undo y límites de costo.
4. Exigir análisis visual real en lugar de pasar únicamente nombres de archivo y esperar que la IA adivine. Si OCR/transcripción/modelo visual no está disponible o permitido, IA debe declararlo y pedir al usuario completar la descripción. Respeto a privacidad, local-first y API keys protegidas.

## 5. Captura nativa integrada, no aplicación aparte

UI de Wivra: **Editor / Capturar / LIVE / Biblioteca / Proyectos / Ajustes** como vistas del mismo producto (navegación exacta por diseñar en móvil). Una sola capa de proyectos/media.

- Cámara principal: Ray-Ban Meta vía SDK DAT (iOS primero), cámara del teléfono alternativa, otras fuentes externas mediante adaptadores compatibles posteriormente. No vender hardware inexistente.
- Entrada de audio elegible por usuario: Ray-Ban HFP/iPhone/Bluetooth/USB solo si iOS confirma ruta. Un receptor USB con 2 transmisores puede transportar **2 canales en una entrada**. Si son realmente distintos, guardarlos como pistas lógicas 0/1, editar por separado, opcional ganancia independiente en LIVE. No presumir HFP y USB al mismo tiempo.
- Guardar originales + audio separado cuando posible + vista previa combinada; manifiesto `.wivra.json` v2. Importar ese grupo al editor sin duplicar pistas. Test iPhone real + gafas obligatorio para prometer sincronía/estabilidad.

## 6. LIVE multiplaforma, sin fingir habilitaciones

Pipeline objetivo: **Camera DAT/iPhone → reloj común y buffering → audio seleccionado → compositor de overlays opcionales → codificador H.264/AAC (perfil que admita destino) → RTMPS/RTMP → plataforma**. El HEVC local no implica HEVC apto para todos los destinos. Mantener grabación local opcional y telemetría bitrate/FPS/RTT/conexión/temperatura. Teclas/credenciales nunca en Git ni logs.

Conector de destinos estándar `LiveDestination { id, displayName, protocol, ingestURL, credentialsRef, portraitLandscapeConstraints, availability, connectionState }`. Separar UI y protocolos:
- **YouTube Live:** primero pruebas con RTMPS y canal habilitado; integración futura OAuth/API (crear stream/broadcast, asociar, iniciar). Fuente oficial: https://support.google.com/youtube/answer/10364924, https://developers.google.com/youtube/v3/live/docs/liveStreams.
- **Twitch:** RTMP y stream key documentados oficialmente: https://dev.twitch.tv/docs/video-broadcast/.
- **Instagram Live:** verificar en la cuenta acceso a Live y herramienta Live Producer/RTMP y sus claves. Existen requisitos de elegibilidad; no prometer credenciales disponibles universalmente. Meta anunció MoQ **interno** para Instagram móvil el 12-oct-2026; ese anuncio no implica API pública para Wivra: https://engineering.fb.com/2026/10/12/video-engineering/shipping-media-over-quic-at-meta-scale-for-instagram-live-ingest/.
- **TikTok LIVE:** TikTok ofrece herramientas y algunos flujos autorizados con software externo y RTMP; capacidad depende de cuenta/territorio/eligibilidad. Fuente TikTok Seller University https://seller-uk.tiktok.com/university/essay?knowledge_id=7738055662569218, Studio oficial https://www.tiktok.com/live/studio/help. **No evitar restricciones con extracción de tokens, scraping de claves ni ingeniería inversa de endpoints privados.**
- **Custom RTMP/RTMPS:** usuario puede pegar URL y clave legítimas con validación y manejo seguro, destino genérico sin marca.
- **Multidestino:** primero UN destino confiable. Simultáneo a varios servicios después, mediante relay/multistream legítimo opcional o codificación separada solo si recursos/bitrate, términos y permisos lo permiten. Un relay tiene costo/latencia/privacidad y nunca se activa por defecto. No prometer comentarios unificados/chat de plataforma sin APIs/autorización.

**Importar desde URL ≠ transmitir a URL**:
- **URL de medios**: admitir descarga/importación de archivos directos de acceso legítimo con derechos/consentimiento, HTTPS, tipos/formato/tamaño/seguridad/CORS o proxy autorizado. No extracción no autorizada de contenido de redes sociales, DRM ni bypass de login.
- **URL de streaming**: servidor y clave de ingestión autorizados; secretos cifrados/Keychain y nunca exponer en logs, archivos compartidos ni PR.
- URLs para compartir videos exportados solo en fase de publicación con consentimiento, no subida automática de originales.

## 7. Fases de aceptación (gate explícito, sin falsas declaraciones)

**FASE A / Decisión de motor (PR Claude evaluación):** clonar OpenReel y OpenCut Classic SOLO en sandbox; leer licencias; reportar matriz de 25+ funciones, video demostrativo o capturas propias, test Safari real. Presentar decisión A/B/C para autorización. No descartar el trabajo ya realizado por Claude.

**FASE B / Editor completo base:** una línea de tiempo de 3 clips video + 2 audios externos, recortes, overlay/texto, transiciones, subtítulos, export MP4 1080p con audio correcto; guardado/rehidratación del proyecto, undo y 1 grabación de voz en off. Validar en iPhone real, Android después.

**FASE C / IA real:** análisis de 10 clips de prueba (fotogramas + audio transcript), solicita resumen del contenido, edita usando mismas operaciones de FASE B, previsualiza, ajusta por chat y deshace. Guardar evidencia, costos y límites.

**FASE D / Meta y sonido:** pruebas con Ray-Ban físicas + iPhone, permiso, HFP y fuente alternativa, 30s/3min, heat, audio offset, pérdida de ruta, ingestión de manifest en editor. Dos TX USB si existe hardware para probar.

**FASE E / LIVE:** primera transmisión privada/no listada con cuenta autorizada a YouTube/Twitch y RTMP(S); video/audio A/V, reconexión, botón terminar, no filtrar key, grabación local con consentimiento. Instagram/TikTok solo cuando exista vía autorizada verificable. Luego multi-destino si es viable.

## 8. Reparto de trabajo (sin ramas en conflicto)

- **Claude:** lidera editor de video completo y evaluación/fork legal de motores open-source, UX táctil original, bibliotecas, timeline, exportaciones, audio externo, IA mediante operaciones. Mantiene `app/` y `core/` hasta que se acuerde motor final.
- **ChatGPT:** lidera DAT Ray-Ban, adaptadores de cámaras, audio fuente/sidecar, `.wivra.json`, codificador y destinos RTMP(S), seguridad de claves y conectores LIVE, pruebas integración; **no reescribe editor de Claude**.
- **Meta AI:** investigación limitada al ecosistema Meta/SDK, advertencias de capacidad, batería, gafas, controles manos libres, pruebas específicas con fuentes; no implementa funcionalidades comerciales DJ/tours sin pedido.
- **Propietario:** valida motor nuevo y autoriza merges, decisiones de prioridades, plataformas/credenciales. No se hacen merges a `main` sin aprobación.

## 9. Próximo paso exacto y medible

**Claude**, desde PR #44: **no seguir agregando paneles sueltos antes de evaluar reutilización de un motor de verdad**. Leer este documento y `docs/OPENCUT_EVALUATION.md`, clonar OpenReel y OpenCut Classic fuera del repo, producir benchmark con checklist P0/P1, capturas y pruebas de licencias/táctil. Comparar con el actual Wivra, recomendar motor A/B/C e identificar una ruta de migración conservadora para la IA y código ya escrito. Entregar PR en borrador *solo de evaluación* y actualizar issue #49. Solo tras aprobación escoger fork/módulos.

**ChatGPT**, en paralelo: conservar PR #51, documentar perfil del encoder + arquitectura de destino YouTube RTMPS y destino custom, sin afirmar LIVE operativo antes de pruebas end-to-end. No fusionar.

**Fuente de verdad:** código GitHub `Os-WHGo/Wivra`; investigación Meta AI en Drive. Comprobada carpeta Drive antes de redactar (6 docs, sin cambios desde 2026-10-14T03:43Z). Toda recomendación sobre repos de terceros debe revalidar hash/licencia antes de copiar. Conservamos nombres del producto Wivra y consentimiento del usuario.

— ChatGPT


## 10. NUEVA DECISIÓN del propietario: gratuito, offline-first, pistas reales y efectos integrados

**Esta decisión posterior sustituye cualquier prioridad anterior que sugiriese invertir pronto en IA generativa, catálogos masivos de efectos, plantillas de pago, descargas necesarias por efecto o mini editor de clips sin pista adicional.**

**Documento de alcance obligatorio y tests de aceptación:** [WIVRA_DECISION_EDITOR_MULTITRACK_OFFLINE_FREE_2026-10-13.md](./WIVRA_DECISION_EDITOR_MULTITRACK_OFFLINE_FREE_2026-10-13.md).

- **Editor completo y gratuito:** cualquier cantidad razonable de pistas V1/V2/V3 y A1/A2/A3, botón `+` en video **y audio**, superposición simultánea, forma de onda real, zoom de timeline, recorte, desplazamiento de tiempos, snap, selección contextual, export renderizado y persistencia. El número real de pistas depende de recursos del dispositivo, no de un paywall.
- **Voiceover durante edición:** reproducir video en timeline y grabar otra voz desde micrófono elegido, crear pista de audio sincronizable y editable; medir latencia y aceptar corrección manual.
- **Plantillas rítmicas + AutoCut musical:** detectar beats/onsets con DSP local cuando posible y ajustar cortes a música importada legalmente, con plantillas livianas de duración/transiciones. Borrador editado y reversible; sin necesidad de IA generativa ni conexión.
- **Efectos integrados sin descargas ni pagos:** unos pocos efectos/transiciones de calidad renderizados de forma nativa/algorítmica y presets pequeños en paquete inicial; descargas gratuitas opcionales únicamente cuando se aprueben y no bloqueen edición offline. Sin cientos de GB ni catálogos propietarios CapCut.
- **IA esencial:** director/asistente que comprenda videos cuando tenga acceso real a fotogramas/audio y sugiera o ejecute cortes/montajes mediante operaciones validadas. No priorizar efectos IA generativos, avatares ni creación sintética. Subtítulos pueden introducirse manualmente/localmente; STT y traducción remotos son opcionales sujetos a consentimiento/costo.
- **Offline-first:** las funciones básicas listadas deben funcionar con archivos locales en modo avión, *una vez que la app y sus recursos están disponibles*, dentro de las limitaciones reales de almacenamiento/códecs/iOS. LIVE, URL remotas e IA nube requieren red. El usuario no quiere costes ni cargos ocultos; verificar costes de servidores opcionales.

**Responsabilidad inmediata Claude:** usar estos criterios para benchmark de OpenReel/OpenCut/actual editor, con pruebas iPhone, y proponer motor con soporte de pistas/export antes de construir miles de menús. **ChatGPT** no debe reescribir `app/`/timeline de Claude. Ningún cambio a main hasta autorización.



## 11. Referencias técnicas verificadas: UI de pistas y transiciones gratuitas

Nueva especificación de precisión para Claude: [Controles por pista y auditoría de efectos MIT](./WIVRA_AUDIO_TRACK_CONTROLS_AND_FREE_EFFECTS_AUDIT_2026-10-13.md). Incluye parlante pequeño por pista, dividir únicamente segmento seleccionado, deshacer/rehacer, evitar doblar audio separado y la lista de shaders `gl-transitions` individuales con MIT comprobada. Se evaluarán PixiJS Filters y glfx.js, sin incorporarlos todavía ni arriesgar bundle grande. Efectos incluidos y utilizables offline, sin cobros ni dependencias de IA. No se ha añadido código al editor ni a `main`.
