# Wivra · Auditoría cruzada, aplicaciones, IA y asistentes
**Fecha:** 15 de octubre de 2026. **Autor:** ChatGPT. **Estado:** verificación de repositorios/código/documentación pública; sin pruebas físicas, sin merges.

## Decisión del propietario y límites

Wivra debe mantener UN producto de edición de video/fotos, captura y LIVE: iOS, Android, iPad/tablets y posible escritorio (macOS/Windows/Linux). Desarrollo inicial iPhone NO implica exclusividad. El motor de edición y sus operaciones han de poder controlarse desde una IA **local gratuita por defecto** y, opcionalmente, **agentes externos** como ChatGPT, Claude, Siri, Meta AI o futuros proveedores cuando ofrezcan APIs, MCP, intents o conectores compatibles. No depender de una marca ni de un proveedor único, no exigir claves/tokens de pago para funciones básicas, y no convertir Wivra en varios editores duplicados.

Los ejemplos de orden son `abrir proyecto`, `cortar clip`, `aplicar filtro`, `mejora esta imagen`, `enfoque nocturno`, `abrir cámara`, `preparar grabación de 60 minutos`, `preparar/iniciar LIVE en el perfil guardado`. **Un comando pedido no demuestra disponibilidad física ni autorización para ejecutarlo**. La IA interpreta y planifica; las herramientas del editor/cámara hacen el trabajo; toda acción tiene permiso, estado, errores y revisión.

## 1. Auditoría de código actual y dependencias

| Módulo | Fuente real consultada | Existe | Falta / cautela |
|---|---|---|---|
| Editor Claude | PR #44, `claude/integration-director` HEAD revisado `39af98c`, CI 4/4 verde | Un editor web para teléfono, timeline con clips y overlays, filtros, audio, guardado IndexedDB, export via canvas/MediaRecorder, parser `.wivra.json`, herramienta IA externa `edit_apply` | No ensayado en Safari iPhone real; HEVC/CAF iOS, export largo, cuota/archivos grandes pendientes; vía IA directa solo expone siete operaciones del motor, y hoy recibe principalmente nombres/duraciones, NO comprensión semántica de videos |
| Director adicional ChatGPT | PR #54 `42d020e` | Borrador local narrativo e instrucciones con opt-in para IA; CI 4 verdes **en su base** | Desfasado de #44 (15 commits adelante/22 detrás al auditar); `build.mjs` de su rama no incluye módulos nuevos (persistencia, GIF, filtros, captura). Reconciliar con HEAD sin sobreescribir `dist`. |
| Captura iOS | PR #61 `dabb2de` | AVFoundation iPhone Auto/Pro con ISO/obturación/acercamiento de foto y cámara Ray-Ban DAT de cadena previa; tests/compile iOS arm64 green | Foto durante MOV, MIC, sincronía y calentamiento NO verificados en hardware. iPhone guarda JPEG/MOV sin manifiesto uniforme de editor. No modo astronómico. |
| LIVE iOS | PR #59 `8efde7b` | Simulador local de Preview/Programa, escenas, intents de audio/comunidad y tests/compile | No emisión real, autentificación a proveedores ni encoder RTMP(S) en producción |
| Interoperabilidad | `app/capture-manifest.mjs`, `streaming/contracts/wivra-manifest-v2.schema.json` | Fixtures v2 coinciden literalmente; campos y roles canónicos alineados. Copia de schema en editor omite 2 descripciones, no hay divergencia de validación identificada | Dos pistas con canales distintos en mismo archivo pueden reproducir **archivo completo dos veces**: el editor reconoce `channelIndex` pero NO hace extracción L/R. Confirmar sin duplicación real; manifest separado para cámara del iPhone; proyecto único de medios. |
| Integración global | `main` y refs anteriores | `main` conserva fundamentalmente documentación; ramas PR draft apiladas | Editor `app/` y miniapp `streaming/ios/B0` son productos de ejecución distintos. No unificar mediante una copia pegada sin pruebas del puente (archivos, IDs, codecs, sesiones y permisos). |
| Divergencia propia | PR #61 vs PR #59 | Comparten B1D | Modifican `MetaB0Model.swift`, `WivraMetaB0App.swift`; sesión/registro/cambio Meta↔iPhone se debe serializar en una sola composición, sin perder LIVE. |

**Conclusión de auditoría:** Arquitectura interoperable en el formato v2, pero **aún no existe un flujo dispositivo físico completo cámara→biblioteca→editor→export ni IA local semántica**. CI no equivale a producción.

## 2. Repositorios externos inspeccionados · adopción responsable

| Código | URL | Licencia de repo observada | Uso permitido/propuesta | Riesgos/bloqueo |
|---|---|---|---|---|
| LibreCuts (Android/Kotlin) | https://github.com/tharunbirla/LibreCuts | MIT | Estudiar timeline, capas, máscaras, chroma-key, subtítulos SRT, voice-over, transiciones, export, persistencia y pruebas de interacción. Portar algoritmos o patrones con atribución donde corresponda; no copiar pantallas/marcas. | No se trasplanta Kotlin a iOS como código directo. Auditar dependencias y datos/assets individualmente. |
| ClearCut (Android/Kotlin) | https://github.com/SysAdminDoc/ClearCut | MIT | Investigación de Media3, proyectos, audio, captions, resiliencia al error, packs y pruebas | Gran complejidad y dependencia Android; NO reemplazar el editor de Claude |
| GPUVideo-android (Java/GL) | https://github.com/MasayukiSuda/GPUVideo-android | MIT | Leer lógica/fórmulas de efectos de video y portarlas a rutas Android/iOS/Web equivalentes con pruebas pixel a pixel | Último push observado 2023, dependencias antiguas; no base de producción |
| AndroidX Media3 | https://github.com/androidx/media | Apache-2.0 | Export/transformación Android recomendables para benchmark frente a los métodos actuales | Android-only; licencias de codecs/hardware y soporte por dispositivo |
| OpenReel Video | https://github.com/Augani/openreel-video | MIT | Referencia de timeline multipista web, escritorio, formatos y arquitectura de edición | Benchmark en hardware y licencia de cada dependencia antes de integrar |
| Tauri | https://github.com/tauri-apps/tauri | Apache-2.0 | Candidato de contenedor escritorio y móvil para reutilizar interfaz web y puente nativo | NO se eligió todavía; WebView de cada OS y export/cámara requieren benchmarks |
| sherpa-onnx | https://github.com/k2-fsa/sherpa-onnx | Apache-2.0 | STT/VAD local iOS+Android+escritorio sin consumo API; subtítulos/transcripción opcional | Modelos individuales: verificar licencia/idiomas/tamaño/batería/acierto |
| WebLLM | https://github.com/mlc-ai/web-llm | Apache-2.0 | Inferencia local navegador WebGPU; prototipo de tool-calling/interpretación | iOS WebView/WebGPU/memoria/tamaño de modelos pueden bloquear; nada instalado |
| ffmpeg.wasm | https://github.com/ffmpegwasm/ffmpeg.wasm | MIT (wrapper) | Prototipar procesado/export web fuera de hardware nativo | FFmpeg y codecs embebidos tienen condiciones y tamaño/rendimiento propios. Auditar obligaciones independientes; no asimilar MIT wrapper a códecs. |

**Regla de auditoría:** permisos del repo principal NO sustituyen licencias de assets, fuentes, plugins, modelos, samples, FFmpeg/copyleft o patentes de códecs. Ninguna dependencia anterior ha sido incorporada automáticamente. Priorizar portar algoritmos/permutar adaptadores, **no forkear/reemplazar motores completos**. Evaluar equivalencia visual Preview/Export y reproducibilidad de tests.

## 3. Un solo motor, varias superficies y proveedores

### 3.1 Arquitectura lógica propuesta

```
Siri / Atajos iOS · Meta Voice Invocations · ChatGPT/MCP · Claude/MCP · otros
                          |
               ADAPTADORES EXTERNOS
                          |
         Registro de acciones Wivra (schema versionado)
                          |
 permisos + contextos + capabilities + dry_run + confirmación
                          |
               EJECUTOR LOCAL DE WIVRA
                  /        |         \
     EDITOR (Claude)    CAPTURA       LIVE (ChatGPT)
       + fotos/filtros  iOS/Android    canales/escenas
                  \        |         /
           proyecto/asset IDs, manifest v2, biblioteca
                          |
       archivo local · export · reversión y log de acciones
```

**Importante:** el MCP servidor no puede por sí mismo atravesar la sandbox y controlar un iPhone dormido. Un conector de ChatGPT/Claude solo puede ofrecer lo que el host/app y usuario autorizan. El móvil requiere un receptor y ejecución propia (App Intents/deep link/cola segura, cuando disponible) y puede exigir abrir Wivra al frente. Sin servidor público por defecto, sin acceso a archivos arbitrarios y sin secretos en URLs.

### 3.2 Contrato mínimo de herramientas (diseño, NO endpoint disponible)

`project.list`, `project.open`, `media.import_selected`, `media.analyze_local`, `edit.plan`, `edit.apply_reviewed`, `edit.undo`, `effect.apply`, `photo.adjust`, `capture.select_source`, `capture.prepare`, `capture.start`, `capture.stop`, `live.prepare`, `live.go_live`, `live.stop`, `export.prepare`, `export.start`, `task.status`. Pistas de audio/canales/biblioteca y foto se representan como IDs de assets estables.

Cada solicitud contiene versión, origen, `action`, `projectId`, parámetros limitados/validados, intención de consentimiento, `requestId` idempotente; retorno: disponible/no disponible, capacidades, errores concretos, media generada cuando exista. No almacenar tokens de servicios dentro de proyectos. Previsualización de todos los cambios destructivos, propuesta reversible y revisión; cámara/micro/LIVE tienen estado inequívoco y LED/UI visible; acciones externas **no pueden fingir que grabaron o emitieron**.

**Adaptadores concretos**: iOS App Intents/Siri y Shortcuts; Android Intents/App Actions según disponibilidad; MCP/Apps SDK o conector de herramientas para ChatGPT/Claude en superficies soportadas; Meta DAT Voice Invocations cuando la app/SDK/locale/políticas lo permitan. Android/iOS/escritorio comparten esquema de acciones y motor lógico, adaptan drivers y rutas de permisos. El productor de comandos no tiene permiso para inventar datos de medios.

### 3.3 IA gratuita y real: prioridades

- **Capa 0, sin modelo (gratis y offline):** herramientas reales y reglas locales sobre `Project` y timeline: cortar/mover/rotular/silenciar con parámetros exactos, elegir encuadre, presets, detectar silencio por VAD o volumen local; NO confundir un simple regex con comprensión completa.
- **Capa 1, IA local (gratis por solicitud):** STT con sherpa-onnx o opción comprobada; pequeños clasificadores/local LLM para transformar instrucciones en schema de herramientas. Requiere benchmark RAM, GPU/ANE/NPU, CPU, batería, idioma español, privacidad y tamaño descargable opcional; fallback sin modelo. El procesamiento consume cómputo y tokens locales pero no facturación por API.
- **Capa 2, agentes externos opcionales:** ChatGPT, Claude, Gemini, Meta y futuros mediante MCP/provider/capacidades permitidas, sin forzar proveedor ni clave pagada; un agente externo no equivale a plan gratuito ilimitado. Los comandos se convierten en herramientas Wivra, **nunca en edición directa de los medios por la IA**.

Hallazgo prioritario de código: `core/in-app-agent.mjs` ya tiene patrón `propose → validate → approve` con `localBasicCommand`; `app/ai-client.mjs` tiene cliente OpenAI-compatible que recibe nombres y duraciones y expone un `EDIT_TOOL` de **7 operaciones** mientras `core/operations.mjs` ya ofrece más funciones (capas, audio, formato, filtros). **No existen aún una pasarela de herramientas completa, STT local instalada ni IA que interprete automáticamente los videos.** Unificar ambas rutas y conectar `edit_apply` ampliado al registro de herramientas actual: ChatGPT no modifica `app/` ni `core/` sin Claude.

### 3.4 Seguridad y consentimiento

- Nunca iniciar cámara/micrófono o emisión a escondidas. Distinguir acciones solo lectura, reversibles y sensibles (captura, publicar, borrar/exportar/emitir). Estado explícito en pantalla y consentimiento inicial/por operación conforme a OS.
- `live.prepare` permite cargar el perfil preferido sin difundir claves; `live.go_live` debe comprobar conexión y consentimiento, responder con ACK de encoder real. Con un host que exija traer la app al foreground, hacerlo y no prometer inicio automático en background.
- `capture.prepare` puede seleccionar duración deseada; `capture.start` reporta inicio efectivo y errores (térmico, permiso, desconexión, memoria). Grabar 1h en Ray-Ban o teléfono **no está garantizado**.
- Datos privados por defecto solo en el dispositivo; agentes reciben resumen/frames/transcripciones solamente tras optar por compartir, con límites. No usar deep-links con secretos; controles y auth de un solo uso en integraciones remotas.

## 4. Foto astronómica, nocturna, foco y cámara con IA

**Dos objetivos diferentes:**

1. **Fotos de estrellas** con cámara iPhone: priorizar foto fija con trípode, enfoque al infinito **si hardware permite ajustar lente**, ISO/tiempo **dentro de límites reales del formato**, ráfaga/bracketing, alineación/stacking y reducción de ruido local. La IA puede sugerir parámetros a partir del histograma, luminancia, estrellas detectadas y nitidez de frames; no puede fabricar fotones ni asegurar astrofoto en todos los lentes. `AVCapturePhotoOutput` admite fotos RAW/bracket en configuraciones aptas. **B1H actual NO incluye modo astro y limita obturación a 1/30–1/1000s**, por lo que no sirve para exposición larga de estrellas.
2. **Videos nocturnos** en iPhone: la sensibilidad mejora por exposición por fotograma, ISO y procesamiento de denoise; **no es posible exponer cada fotograma por más tiempo que su intervalo si se conservan sus FPS**. 30fps deja, en términos prácticos, máximo ~1/30s por frame; al bajar a 15/10fps se gana exposición por fotograma pero se pierde fluidez, y no todos los formatos lo permiten. Un "obturador más abierto" se refiere a mayor tiempo de exposición; **la apertura física del iPhone habitualmente es fija** (`lensAperture` read-only en AVFoundation), no puede abrirse por software.
3. **Ray-Ban Meta/gafas**: el acceso público de DAT a cámara/audio y foto NO equivale a un control nativo completo de exposición, enfoque al infinito, apertura, RAW, timelapse o 1h de grabación. No implementar control manual hasta verificar API y gafas físicas. Si el hardware no lo permite: cámara de gafas para POV normal, iPhone para astro nocturno, o procesamiento posterior de material existente que no invente detalles; UI informa incompatibilidad.
4. **IA cámara**: una `PhotoCaptureIntent`/comando local puede seleccionar `night`, `stars`, `portrait`, `motion` por **capability check** y métricas medibles; proponer parámetros, controlar fotos si OS deja, mostrar vista previa y revertir. Editor de fotos reutiliza presets/filtros no destructivos existentes; el modelo no tiene que "crear" toda la imagen para hacerla más limpia.

Fuentes de API verificadas: https://developer.apple.com/documentation/avfoundation/avcapturedevice/setexposuremodecustom%28duration%3Aiso%3Acompletionhandler%3A%29 ; https://developer.apple.com/documentation/avfoundation/capturing-a-bracketed-photo-sequence ; https://developer.apple.com/documentation/avfoundation/avcapturedevice/lensaperture ; https://developers.meta.com/wearables/faq/ .

## 5. Matriz de integración por etapas y gates

**P0 · Auditoría/arquitectura (ahora):** cierre de #54 contra HEAD actual #44 sin pérdida de sus módulos; documentar equivalencia `EDIT_TOOL`/motor; definición compartida de contratos de herramienta/capacidad/identidad de medios. Revisión cruzada de Claude de #61 y #59; todos los PR draft; cero cambio de main.

**P1 · Primer vertical funcional (iPhone real):** validar JPEG/MOV/CAF, fotos durante MOV, sesión Meta y conmutación sin pérdida; captura→importación→audio aparte sin duplicar→efecto→guardar/abrir→export; comandos de edición local controlando esas operaciones desde la pantalla (sin API). Medir batería, tiempo y memoria.

**P2 · IA local real de primera calidad básica:** benchmark STT local y parser/fallback sin red en dispositivo, calidad de órdenes específicas en español, herramienta `edit.plan` y `edit.apply_reviewed` compartidas; enseñar al usuario qué sí puede analizar. No prometer IA que "ve" video sin extractor local consentido de fotogramas/voz.

**P3 · Android y escritorio:** cámara Android CameraX/Media3/Meta DAT (cuando soportado) con mismo contrato; evaluar Tauri/WebView nativo y desktop export acelerado sin decidir packaging antes de benchmarks. Mismo proyecto desde Android/iPhone/PC **mediante export/import de proyecto+medios**, sin sincronización cloud automática.

**P4 · Asistentes externos y LIVE real:** App Intents para abrir modos/propuestas, integración MCP/Apps SDK/Claude si disponibilidad real; Meta voice invocations, que puede requerir permisos/versiones; adaptador de cola móvil con autenticación y foreground. LIVE servidor predefinido (credencial SecureStore/Keychain/Keystore) requiere encoder real/ACK antes de indicar "En vivo".

## 6. Resultado solicitado a Claude (revisión recíproca)

1. Revisar en modo solo lectura PR #61 y #59, separar deficiencias de plataforma, multimedia, enlace a biblioteca y seguridad; dar resultado **Aprobar conceptualmente / Cambios necesarios / Bloqueado** con líneas/tests.
2. Reconciliar PR #54 con HEAD **actual** #44 **en rama de prueba separada**, sin quitar los cambios de persistencia/filtros de Claude; documentar regresiones y alternativas; requerir permiso del propietario antes de merge sobre su rama.
3. Evaluar `EDIT_TOOL` en `app/ai-client.mjs` frente a **todo el motor de operaciones** de `core/operations.mjs` y `core/in-app-agent.mjs`. Proponer herramienta común unificada, modelo local opcional y plan de evidencias, sin dependencia obligatoria de API externa.
4. Revisar que el diseño permanezca un editor manual útil gratis, móvil primero; escritorio posterior y mismas decisiones no destructivas. Un solo proyecto, sin segundo motor.
5. Responder en issue #49 o PRs indicando SHA, pruebas reales/simuladas, fecha, bloqueos, y orden. No merge sin autorización.

**Regla final:** proteger el trabajo ajeno y seguir política de fuente única para código. Investigación de otros proyectos privados no se publica ni traslada a este repo.

— ChatGPT · 2026-10-15
