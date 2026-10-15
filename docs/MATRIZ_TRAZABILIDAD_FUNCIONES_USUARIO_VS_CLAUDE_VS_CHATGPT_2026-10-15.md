# Wivra · Auditoría bidireccional: requisitos del propietario vs Claude vs ChatGPT

**Fecha:** 15 de octubre de 2026. **Alcance:** función por función, basada en peticiones previas del propietario y ramas GitHub. **NO hay fusiones autorizadas a `main`.**

**Commits auditados:** Claude Editor [#44](https://github.com/Os-WHGo/Wivra/pull/44) `b60de03fc2`; ChatGPT Director [#54](https://github.com/Os-WHGo/Wivra/pull/54) `42d020e6eb`; ChatGPT Cámara [#61](https://github.com/Os-WHGo/Wivra/pull/61) `dabb2de316`; ChatGPT LIVE [#59](https://github.com/Os-WHGo/Wivra/pull/59) `8efde7b74c`; diagnóstico con tests [#63](https://github.com/Os-WHGo/Wivra/pull/63) `201982bb6c`.

## Método y significado

- **Una fila = una capacidad solicitada**. No es un método, commit, botón ni esfuerzo estimado. Dividir/agrupar requisitos afectaría las cifras; este corte es un inventario trazable que puede seguir creciendo.
- **T = prototipo en código** respaldado por lógica/CI o compilación, **NO prueba de dispositivo físico**. **I = parcial/solo simulación**. **D = investigado/documentado, sin esa función completa**. **- = no identificado**. En resultado global **N = no implementado**.
- **Columnas Claude/ChatGPT no se suman**: una misma capacidad puede estar en ambas ramas porque Claude ya integró módulos creados originalmente por ChatGPT (Director/checklist, comandos locales y validador). Contar una sola vez en cobertura global.
- Editor web de Claude y proyecto SwiftUI iOS de ChatGPT viven en ramas distintas; **ninguna fila T significa una app unificada**. Safari iPhone, Android, Ray-Ban y LIVE real NO han pasado aceptación física.

## Cantidades exactas de este inventario

| Área | Solicitudes distintas | T: prototipo | I: parcial | N: no implementado |
|---|---:|---:|---:|---:|
| Editor, efectos y biblioteca | 33 | 22 | 4 | 7 |
| Cámaras, fotografía y micrófonos | 27 | 11 | 5 | 11 |
| LIVE | 15 | 3 | 5 | 7 |
| Director e inteligencia artificial | 20 | 5 | 6 | 9 |
| Plataformas e integración | 10 | 3 | 2 | 5 |
| **Total** | **105** | **44** | **22** | **39** |

**Por rama (hay superposición):** Claude #44 tiene 32 prototipos T y 10 implementaciones parciales I; ChatGPT #54/#61/#59 tiene 25 prototipos T y 15 parciales I. Hay 9 filas prototipo T en ambas. Esto mide presencia funcional, no mérito individual ni producto listo.

## Lista completa y comparación recíproca

| Código | Requisito del usuario | Claude | ChatGPT | Cobertura |
|---|---|:---:|:---:|:---:|
| **Editor, efectos y biblioteca** | | | | |
| ED-01 | Importar varios videos | T | - | **T** |
| ED-02 | Reordenar videos | T | - | **T** |
| ED-03 | Recortar clips | T | I | **T** |
| ED-04 | Dividir clips | T | I | **T** |
| ED-05 | Eliminar tramos/cerrar huecos | T | - | **T** |
| ED-06 | Deshacer/rehacer | T | T | **T** |
| ED-07 | Timeline táctil y zoom | T | - | **T** |
| ED-08 | Multipista de video | T | - | **T** |
| ED-09 | Capas/superposiciones móviles | T | - | **T** |
| ED-10 | Gestos para mover/escalar capas | T | - | **T** |
| ED-11 | Máscaras y formas sobre video | T | - | **T** |
| ED-12 | Marco, transparencia y orden capas | T | - | **T** |
| ED-13 | Capas PNG/JPG/GIF/logos | T | - | **T** |
| ED-14 | Foto como clip principal | D | - | **N** |
| ED-15 | Texto/títulos manuales | T | T | **T** |
| ED-16 | Transiciones entre dos clips | D | - | **N** |
| ED-17 | Efectos entrada/salida | T | - | **T** |
| ED-18 | Filtros WebGL, grano y looks video | T | - | **T** |
| ED-19 | Paquetes de looks gratuitos y offline | I | D | **I** |
| ED-20 | Volumen/mute por clip y pista | T | I | **T** |
| ED-21 | Pistas independientes de audio editor | T | I | **T** |
| ED-22 | Extraer canal izquierdo/derecho separado | I | D | **I** |
| ED-23 | Grabar voz en off dentro editor | - | D | **N** |
| ED-24 | Cortes sincronizados automáticamente a música | - | D | **N** |
| ED-25 | Subtítulos automáticos | - | D | **N** |
| ED-26 | Narración TTS para videos | - | D | **N** |
| ED-27 | Proporciones sociales | T | - | **T** |
| ED-28 | Producir múltiples versiones del proyecto | I | D | **I** |
| ED-29 | Guardar múltiples proyectos localmente | T | - | **T** |
| ED-30 | Recuperar archivos faltantes al reabrir | T | - | **T** |
| ED-31 | Exportación audiovisual real | T | - | **T** |
| ED-32 | Render acelerado no en tiempo real | - | D | **N** |
| ED-33 | Editor completo de fotografías estilo Snapseed | - | I | **I** |
| **Cámaras, fotografía y micrófonos** | | | | |
| CAP-01 | iPhone: preview y selector de lentes | - | T | **T** |
| CAP-02 | iPhone: modo cámara Auto | - | T | **T** |
| CAP-03 | iPhone: Pro ISO/obturación | - | T | **T** |
| CAP-04 | iPhone: enfoque manual | - | T | **T** |
| CAP-05 | iPhone: guardar JPEG y MOV | - | T | **T** |
| CAP-06 | iPhone: pedir foto durante MOV | - | I | **I** |
| CAP-07 | iPhone: filtros para JPEG, original intacto | - | T | **T** |
| CAP-08 | Fotos estrellas: larga exposición | - | D | **N** |
| CAP-09 | Enfoque de estrellas guiado por IA | - | D | **N** |
| CAP-10 | Video nocturno adaptativo por luz y FPS | - | D | **N** |
| CAP-11 | Apilado/bracketing de fotos nocturnas | - | D | **N** |
| CAP-12 | Ray-Ban Meta: conexión y preview DAT | - | T | **T** |
| CAP-13 | Ray-Ban Meta: grabación HEVC local | - | T | **T** |
| CAP-14 | Ray-Ban Meta: foto durante video recibido | - | I | **I** |
| CAP-15 | Ray-Ban Meta: usar audio de gafas | - | I | **I** |
| CAP-16 | Micrófonos detectables BT/iPhone/USB (ruta Meta) | - | T | **T** |
| CAP-17 | Pista CAF separada + audio MOV combinado | - | T | **T** |
| CAP-18 | Manifiesto captura v2: escritor/lector | T | T | **T** |
| CAP-19 | Mismo manifiesto para cámara propia de iPhone | - | - | **N** |
| CAP-20 | Dos transmisores USB: canales realmente independientes | I | D | **I** |
| CAP-21 | Cambio seguro Ray-Ban/iPhone sin carrera | - | I | **I** |
| CAP-22 | Grabaciones largas y background realmente sostenidas | - | D | **N** |
| CAP-23 | Importar grabaciones ya guardadas en gafas | - | D | **N** |
| CAP-24 | GoPro y cámaras 360 con adaptador real | - | D | **N** |
| CAP-25 | Cámara nativa Android | - | D | **N** |
| CAP-26 | Meta DAT Android integrado en Wivra | - | D | **N** |
| CAP-27 | Otras gafas mediante drivers futuros | - | D | **N** |
| **LIVE** | | | | |
| LIVE-01 | Configuración de escenas estilo OBS | - | T | **T** |
| LIVE-02 | Panel Preview/Programa en iPhone | - | T | **T** |
| LIVE-03 | Composición de efectos en video enviado | - | D | **N** |
| LIVE-04 | Encoder y transmisión real RTMPS | - | D | **N** |
| LIVE-05 | Servidor/perfil LIVE guardado seguro | - | D | **N** |
| LIVE-06 | Emisión real YouTube/Twitch/Kick/TikTok | - | D | **N** |
| LIVE-07 | Multistream simultáneo | - | D | **N** |
| LIVE-08 | Reconexión real con red móvil mala | - | I | **I** |
| LIVE-09 | Grabación local a la vez que LIVE real | - | I | **I** |
| LIVE-10 | Chat real conectado a plataformas | - | D | **N** |
| LIVE-11 | Cola y priorización de eventos de chat | - | T | **T** |
| LIVE-12 | Lectura TTS al oído de mensajes | - | I | **I** |
| LIVE-13 | Alertas visibles/sonoras en programa LIVE | - | I | **I** |
| LIVE-14 | Monitor de audio independiente del público | - | I | **I** |
| LIVE-15 | Controlar OBS remoto de manera operativa | - | D | **N** |
| **Director e inteligencia artificial** | | | | |
| IA-01 | Director de preproducción sin videos | T | T | **T** |
| IA-02 | Modo guiado por notas por video | I | T | **I** |
| IA-03 | Pedido automático de mejores momentos | I | T | **I** |
| IA-04 | Checklist de tomas + progreso | T | T | **T** |
| IA-05 | Órdenes locales exactas gratis/offline | T | T | **T** |
| IA-06 | IA propone cambios y usuario aprueba | T | T | **T** |
| IA-07 | Proveedor IA externo OpenAI-compatible en UI | T | D | **I** |
| IA-08 | Historial de conversación y correcciones | T | I | **I** |
| IA-09 | Dictado Web Speech en UI | I | D | **I** |
| IA-10 | LLM semántico local sin API pagada | - | D | **N** |
| IA-11 | Paridad 14 operaciones en herramientas IA | I | D | **I** |
| IA-12 | Muestreo visual de frames sin subirlos | T | T | **T** |
| IA-13 | Entender video/audio/OCR/metadatos semánticos | - | D | **N** |
| IA-14 | Seleccionar highlights con evidencia | - | D | **N** |
| IA-15 | Subtítulos generados por IA | - | D | **N** |
| IA-16 | Controlar foto, filtros, grabación y LIVE con lenguaje natural | - | D | **N** |
| IA-17 | Conector ChatGPT para controlar editor en teléfono | - | D | **N** |
| IA-18 | Conector Claude para controlar editor en teléfono | - | D | **N** |
| IA-19 | Siri App Intents sobre Wivra | - | D | **N** |
| IA-20 | Meta AI Voice Invocations sobre Wivra | - | D | **N** |
| **Plataformas e integración** | | | | |
| PLAT-01 | App SwiftUI iPhone para captura experimental | - | T | **T** |
| PLAT-02 | App completa Android | - | D | **N** |
| PLAT-03 | Editor web adaptable al teléfono | T | - | **T** |
| PLAT-04 | App escritorio Windows/macOS/Linux | - | D | **N** |
| PLAT-05 | Interfaz validada físicamente en iPad/tablet | I | D | **I** |
| PLAT-06 | Un único contenedor editor+cámara+LIVE | - | D | **N** |
| PLAT-07 | Proyectos intercambiables PC/móvil sin pérdida | I | D | **I** |
| PLAT-08 | Privacidad local por defecto | T | T | **T** |
| PLAT-09 | Arquitectura adapters de hardware conectables | - | D | **N** |
| PLAT-10 | Pruebas físicas integrales iPhone/Android/gafas | - | - | **N** |

## Qué ofrece uno y qué le falta integrar al otro

**Claude → ChatGPT:** el editor posee la línea de tiempo, multivideo, capas, GIF, filtros/grano WebGL, plantillas/packs, audio por pista, persistencia IndexedDB, exportación canvas/MediaRecorder y cliente directo de proveedor IA. La app SwiftUI de ChatGPT **no está conectada** a ese motor; no confundir pestaña de cámara con editor completo.

**ChatGPT → Claude:** la rama iOS aporta DAT Ray-Ban, selector de entradas verificadas para la ruta Meta, HEVC/CAF/MOV, manifest v2, foto durante stream, modos iPhone Auto/Pro/fotos y estilos JPEG; la rama LIVE añade scene deck, Preview/Programa y simulación de eventos. El HTML del editor de Claude **no puede manejar automáticamente** esos drivers ni iniciar LIVE.

**Ya integrado de forma común:** Claude incluye el `core/creative-director.mjs`, `core/shoot-checklist.mjs`, `core/in-app-agent.mjs`, `app/vision.mjs` y operaciones base donde hubo aportes de ChatGPT. No reimplementar esos bloques. El manifiesto de ChatGPT es compatible con el parser de Claude, con los límites siguientes.

**Bloqueadores concretos:**

1. `core/operations.mjs` tiene **14 tipos de operación**, pero `app/ai-client.mjs` expone **7** en `EDIT_TOOL`: los filtros/capas no se pueden pedir por esa interfaz IA aunque el editor manual sí los ejecute.
2. `app/capture-manifest.mjs` entiende `channelIndex` pero **no extrae cada canal**, por lo que dos micrófonos en un archivo estéreo generan dos clips apuntando al mismo archivo completo. [Prueba reproducible #63](https://github.com/Os-WHGo/Wivra/pull/63).
3. #54 (extensión narrativa de ChatGPT) **diverge** de #44; no sobrescribir `app/build.mjs`, `app/template.html`, persistencia, GIF o filtros. Reconciliar solo en staging con supervisión de Claude.
4. #61 cámara iPhone y #59 LIVE **divergen** y modifican `WivraMetaB0App.swift` y `MetaB0Model.swift`. Un cambio de fuente puede requerir esperar fin de grabación/sesión; compilar cada rama por separado NO demuestra compatibilidad del merge.
5. El catálogo de 24 filtros descargables se guarda en `app/packs/catalog.json`, mientras `app/build.mjs` construye `dist/agentcut.html`: arranque limpio desde solo HTML offline no garantiza packs precargados si el JSON no acompaña el paquete.
6. Editor foto tipo Snapseed es todavía **parcial** (presets JPEG) y astrofotografía larga exposición/IA-focus **no existe**. La cámara B1H limita obturación a 1/30–1/1000 segundos; Meta DAT no ofrece manual astro confirmado.
7. IA local sin pagar por API es hoy **regex básico**, no LLM; Cloud provider no validado con hardware real o cuentas; Siri/Meta/ChatGPT/Claude conectores y versión escritorio/Android son objetivos, no funciones operativas.

## Fuentes de código principales

- Editor #44: `app/README.md`, `app/template.html`, `app/persist.mjs`, `app/export.mjs`, `app/ai-client.mjs`, `app/vision.mjs`, `app/capture-manifest.mjs`, `app/filters-gl.mjs`, `app/packs/catalog.json`; `core/operations.mjs`, `core/creative-director.mjs`, `core/shoot-checklist.mjs`, `core/in-app-agent.mjs` y pruebas.
- Cámara #61: `streaming/ios/B0/Sources/WivraIPhoneCamera.swift`, `WivraIPhoneCameraScreen.swift`, `WivraAudioRoute.swift`, `WivraAudioSidecar.swift`, `WivraCaptureManifest.swift`, `WivraLocalMux.swift`, `WivraPhotoLooks.swift`, `MetaB0Model.swift` y tests.
- LIVE #59: `streaming/ios/B0/Sources/WivraLiveNativeSceneLab.swift`, `WivraLiveCommunityPanel.swift`, `streaming/live/{scene-deck,community-bus,obs-control-planner}.mjs` y tests.

## Orden de integración y aceptación

**Prioridad 0:** corregir audio L/R y contrato de herramientas IA; reconciliar narrativa #54 con editor #44 en rama staging. **Prioridad 1:** app shell iOS con archivos/asset IDs/manifiesto y roundtrip Ray-Ban/iPhone → Editor → Export; pruebas iPhone físico. **Prioridad 2:** IA local modelo real y STT/VAD; Android y escritorio compartiendo proyecto. **Prioridad 3:** encoder LIVE real, servidor favorito guardado seguro y conectores Siri/Meta/ChatGPT/Claude según APIs y permisos.

**Auditoría funcional documentada, sin cambios al motor ni a `main` y sin pruebas físicas falsas.**