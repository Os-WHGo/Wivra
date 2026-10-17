# Wivra · auditoría técnica integral · registro de evidencias (16-10-2026)

## Alcance y método
Revisión estática de archivos reales de GitHub en la rama `chatgpt/wivra-unified-owner-20261016`, documentos maestros y logs de Actions. **No equivale a QA físico ni certificación de beta.** Mantener la matriz maestra #121 y el congelamiento de funciones. No modificar main.

## Hallazgos confirmados
| Prioridad | Evidencia | Resultado | Acción |
|---|---|---|---|
| P0 | Actions SHA 5cd72a8, 8 workflows fallidos; logs job 117225394185 | `app/dist/agentcut.html` no coincide con `app/template.html` y módulos nuevos; fallan verificaciones reproducibles y los builds móviles posteriores quedan bloqueados | Ejecutar `node app/build.mjs`, guardar dist y repetir todos los workflows |
| P1 | `app/speed.mjs`, `planSpeed` | Inferencia de audio ligado por 80% de superposición puede tratar música como audio ligado | Mitigación en commit 0ee35c0; probar con música completamente solapada y voces reales |
| P1 | `app/export.mjs`, `exportPlan` | El plan prolonga el video hasta el final de audio/overlays, generando huecos negros cuando música dura más que video principal | Reconciliar con la corrección local de Claude que no está verificada en GitHub; diseñar regla explícita de duración y prueba 9s video + 30s música |
| P1 | `app/export.mjs` líneas ~267–275 | Fallos de decodificación de pistas independientes se registran en `skippedAudio`, pero exportación puede continuar sin esa pista | Requerir aviso/confirmación visible y prueba de exportación con audio faltante |
| P1 | `app/export.mjs` líneas ~255–265 | Si no se puede crear AudioContext, continúa sin audio; devuelve `hasAudio` | Verificar UX de advertencia y bloqueo opcional antes de exportar |
| P1 | `app/export.mjs` líneas ~320–402 | MediaRecorder + canvas captureStream depende de soporte real Safari/Android y operación en primer plano | Pruebas reales de duración, A/V sync, codec y segundo plano |
| P2 | `app/ai-client.mjs` | BYOK en memoria, proveedores externos opt-in; no asumir CORS ni límites gratis | Auditar validación URL, redacción de metadatos y error seguro |
| P2 | `app/persist.mjs` | IndexedDB guarda proyecto/archivos si caben; sin garantía de persistencia del sistema | Probar cuota, cierre forzado, reimportación y restauración |
| P2 | `app/autocut.mjs` | Selección de segmentos basada en envolvente sonora; no reconoce escenas ni semántica | Etiquetar correctamente como heurística, sin venderlo como highlights reales |
| P2 | `app/templates.mjs` | Recetas locales con operaciones del editor | Probar slots, undo, fotos, audio y formatos sobre proyectos reales |
| P2 | `app/capture-manifest.mjs` | Normalizador del contrato nativo; no realiza importación de archivos por sí mismo | Pruebas end-to-end de archivos y offsets CAF/WAV/MOV, v1/v2 |

## Módulos inspeccionados
`core/project.mjs`, `core/operations.mjs`, `app/speed.mjs`, `app/tests/speed.test.mjs`, `app/tests/export.test.mjs`, `app/export.mjs`, `app/autocut.mjs`, `app/templates.mjs`, `app/capture-manifest.mjs`, `app/persist.mjs`, `app/ai-client.mjs`, `app/i18n-parse.mjs`, `app/build.mjs`, `app/template.html`, `app/tests/template-guards.test.mjs`, `app/dist/agentcut.html` (metadatos/cabecera), además de alcance y trazabilidad de #121. Revisión estática parcial de cada módulo, **no línea por línea**.

## Matriz de validación de producto
- Editor, timeline, clips, fotos, textos, filtros, plantillas: código encontrado; **QA de UX y E2E pendiente**.
- AutoCut: heurística de audio encontrada; detección semántica y escenas **no demostrada**.
- Director: pruebas de lógica/sintaxis superadas en un job anterior al bloqueo dist; **flujo completo pendiente**.
- Captura iOS, Android, Ray-Ban DAT, micrófonos: PR y manifiestos conocidos; **hardware y sincronización real pendientes**.
- LIVE RTMP: **no certificado** por esta auditoría.
- APK/IPA: builds del SHA fallido quedaron **skipped**, no afirmar instaladores disponibles.
- Accesibilidad y 8 idiomas: guardas presentes; **auditoría manual y dispositivo pendiente**.
- Licencias y dependencias nativas: **inventario pendiente**; no añadir repositorios o skills de ejecución sin verificar.

## Criterios de cierre
1. CI íntegra verde sobre el mismo SHA, incluyendo dist reproducible.
2. Pruebas de export 9s/30s, pistas faltantes, duración y A/V sync.
3. Trazabilidad requisito → ruta de código → prueba → evidencia hardware.
4. Instalación y grabación/exportación reales en iPhone y Android.
5. Ray-Ban y LIVE marcados validados únicamente con dispositivos/red de prueba.
6. Revisión de licencias, permisos, privacidad, accesibilidad, recuperación.
7. Cero fusiones a main sin autorización.

**Estado:** auditoría iniciada y documentada, con bloqueos P0/P1. No declarar finalizada.

## Correcciones efectuadas después del primer registro
- `app/export.mjs` commit `c4c131d`: si existe imagen/video principal, la exportación acaba en el final de esa línea, sin añadir cola negra por audio o overlays más largos. Los proyectos sin línea principal conservan duración calculada para diagnóstico, pero `recordProject` aún exige clips principales.
- `app/tests/export.test.mjs` commit `5fbb8d3`: pruebas de 9 s video + 30 s música, overlay largo y audio-only.
- `app/tests/speed.test.mjs` commit `f28e2a6`: expectativa de duración de exportación actualizada de 16 s a 13 s cuando música excede imagen.
- `app/tests/speed.test.mjs` commit `895851b`: regresión de música dentro de un video sin alterar velocidad.
**Advertencia:** cambios no verificados por CI verde ni sincronizados en `app/dist/agentcut.html`. No fusionar.

## Verificación cruzada de arquitectura
- `README.md` reconoce explícitamente que ningún iPhone ni Android real está validado.
- `streaming/README.md` declara receptor Swift inicial sin compilación en ese documento y ningún LIVE real comprobado.
- `.github/workflows/wivra-complete-beta-assembly.yml` exige HTML reproducible antes de compilar APK debug e IPA sin firmar; falla antes de esos jobs si dist difiere.
- No confundir APK debug instalable con lanzamiento, ni IPA sin firmar con instalador iPhone utilizable.
- **Limitación del procedimiento:** revisión por API de GitHub y Actions; sin checkout local ni dispositivos conectados en esta ejecución. El código puede corregirse, pero pruebas ejecutadas y reconstrucción reproducible siguen pendientes.

## Bloque ampliado · seguridad, nativo, documentación y CI
- `app/ai-client.mjs`: **P1 seguridad confirmado y mitigado**. La base personalizada se concatenaba directamente con `/chat/completions` y podía aceptar HTTP con una clave Bearer. Commit `1d87419` valida HTTPS, prohíbe usuario/contraseña, query y fragmento. Regresión `app/tests/ai-client.test.mjs` commit `eb20b5e`; CI pendiente.
- `app/capture-manifest.mjs`: validación v1/v2, roles, pistas y no duplicar audio integrado; `planImportOps` evita reproducir archivo estéreo completo dos veces cuando se piden canales independientes. **No valida medios físicos**, canales deben extraerse antes.
- `streaming/contracts/wivra-manifest-v2.schema.json`: contrato de offsets explícitos y `muxedFromTrackIDs`; calibración de latencia de dispositivos pendiente.
- `streaming/android/app/src/main/AndroidManifest.xml`: permisos cámara, audio, red, Bluetooth y opt-out analítica/crash DAT declarados; revisar comportamiento de permisos en Android 12–16 y SDK nativo. `allowBackup=false` y `usesCleartextTraffic=false` visibles.
- `docs/WIVRA_BETA_STATUS_MATRIX_2026-10-16.md`: Claude dejó registro de pruebas de editor en CI de #124 y reconoce ausencia de QA real; la matriz aún describe velocidad solo individual y otras funciones que cambiaron posteriormente. **Desactualización documental**, no evidencia de funcionalidad.
- `app/README.md`: contiene secciones históricas que dicen «No exporta todavía» aunque `app/export.mjs` ya implementa exportación; actualizar documentación consolidada tras CI.
- `.github/workflows/wivra-audit-rebuild-editor.yml` commit `a8f7a1b`: workflow acotado exclusivamente a rama de auditoría, intenta regenerar dist y ejecutar pruebas antes de guardar el HTML. **No hay confirmación de ejecución** en las consultas de workflows de estos commits. Si las Actions no arrancan o token no puede escribir, reconstruir en un checkout con Node.
- Se inspeccionó `app/tests/ai-client.test.mjs` y matriz de beta del editor; pruebas de seguridad añadidas sin ejecutar.
- **Auditoría de nativo y hardware todavía abierta:** revisar fuente Swift/Kotlin completo, compilación real, permisos, grabación larga, RTMP, integración de librería y QA.

## Auditoría nativa Android, bloque 3
**Archivos examinados directamente:** `streaming/android/settings.gradle`, `streaming/android/app/build.gradle`, `streaming/android/app/src/main/AndroidManifest.xml`, `streaming/android/app/src/main/java/com/oswhgo/wivra/WivraPhoneCameraActivity.kt` (~716 líneas), `WivraMetaPreviewActivity.kt` (~686 líneas). Inspección focalizada en inicialización, permisos, grabación, WAV, lifecycle, DAT y finalización, no compilación.

| Nivel | Hallazgo y evidencia | Tratamiento |
| --- | --- | --- |
| P1 / limitación | `WivraMetaPreviewActivity` tiene sesión DAT, preview, foto y grabación HEVC segmentada, pero su encabezado histórico dice «no recording»; las capacidades evolucionaron. | No atribuir LIVE/RTMP a la preview; revisar segmentos reales, recuperación y empaquetado en dispositivo |
| P1 / continuidad | `WivraMetaPreviewActivity.onDestroy` realiza `finishToPending()` best-effort en coroutine no supervisada; el propio código advierte que Android puede matar proceso sin `onDestroy`. | No declarar grabación larga recuperable ante muerte del proceso; probar corte de energía, kill y reconstrucción de segmentos |
| P1 / continuidad | `WivraPhoneCameraActivity.onStop` detiene video y WAV al ir a segundo plano, por diseño explícito; no existe grabación background. | Informar usuario y probar bloqueo pantalla/llamada/otras apps; no confundir con LIVE IRL en segundo plano |
| P1 / sincronía | `VideoRecordEvent.Start` registra `elapsedRealtimeNanos` y luego inicia WAV; sidecar usa primer read aproximado, no PTS real del primer frame. | Medir desfase y drift en videos largos; mostrar offset estimado, no sincronización sample-accurate |
| P1 / pérdida de audio | `VideoRecordEvent.Finalize` espera WAV y `completeRecordingWhenReady` avisa fallo si WAV no usable. | Pruebas de fallos/espacio/micrófono desconectado, confirmar que video permanece recuperable |
| P2 / capacidades | Cámara Android usa CameraX FHD y fallback; en dispositivos sin combinación preview+photo+video, deshabilita foto en sesión. | Foto durante grabación es condicionada por hardware; no prometer en todos |
| P2 / dependencia | Gradle fija Meta DAT 1.0.1, CameraX 1.5.3, AndroidX y minSdk 31; Meta requiere registro real. | Verificar resolución de dependencias, licencia, restricciones de Meta, targetSdk y binarios con CI |
| P2 / seguridad | Manifest: `allowBackup=false`, `usesCleartextTraffic=false`, Meta analytics/crash opt-out; Internet y Bluetooth declarados. | Auditar permisos en runtime y ausencia de endpoints no consentidos |
| P2 / trazabilidad | `docs/WIVRA_IDEAS_TRACEABILITY_2026-10-15.md` aún describe fotos principales como solo capas; `docs/WIVRA_BETA_STATUS_MATRIX_2026-10-16.md` sí dice fotos principales disponibles. | Conservar ambos documentos como evidencia histórica; consolidar matriz actual tras CI |

**Estado verificable:** hay implementación Android de cámara de teléfono, selector de micrófono para WAV, DAT y teleprompter sobre preview. No hay demostración de dispositivos físicos, streaming LIVE ni grabación background. Inspección iOS Swift sigue pendiente.

## Auditoría iOS y puente único · bloque 4
**Fuentes inspeccionadas:** `streaming/ios/B0/project.yml`, `Info.plist`, `README.md`, `Sources/WivraMetaB0App.swift`, `Sources/WivraEmbeddedEditorScreen.swift`, `Sources/WivraEditorNativeBridge.swift`, `Sources/WivraEditorLocaleBootstrap.swift`, cabeceras de `Sources/WivraIPhoneCamera.swift` y `Sources/MetaB0Model.swift`, y workflow de ensamblaje móvil. Revisión estática; no ejecución Xcode.

- **P0 integración:** `WivraEmbeddedEditorScreen` empaqueta el HTML de Claude en WKWebView, pero reconoce que **no hay puente nativo de medios completo**. `WivraEditorNativeBridge` expone únicamente `host.capabilities` y `library.list`, con `nativeMediaImport: not_available`. El selector de archivos permite elegir manifiesto + MOV + CAF, pero eso **no demuestra** que importar/guardar/exportar archivos grandes funcione end-to-end en WKWebView. Prueba física indispensable.
- **P1 UX iOS:** `runOpenPanelWith` está marcado `@available(iOS 18.4, *)`, mientras `project.yml` declara deployment target **iOS 17.2**. En versiones 17.2–18.3, el selector especial de capturas locales no está disponible por esta ruta; puede existir picker estándar del sistema. **No afirmar biblioteca integrada idéntica** en todas las versiones soportadas. Decidir fallback nativo compatible o elevar target solo con justificación.
- **P1 captura:** `WivraMetaB0App` realiza handoff en dos fases y detiene ambas cámaras al recibir `didEnterBackground`. Por diseño **no hay captura continua en segundo plano**; la UI reconoce que LIVE no está implementado. El nombre histórico B0 no equivale al estado B1 experimental de audio/video.
- **P1 acceso archivos:** `UIDocumentPickerViewController(forOpeningContentTypes:[.item], asCopy:false)` devuelve URLs externas que pueden ser security-scoped; el comentario de código reconoce la limitación. Validar lectura efectiva por WKWebView y uso de `startAccessingSecurityScopedResource` o importación local segura según corresponda.
- **P2 seguridad positiva:** navegación WKWebView restringida al HTML empaquetado; puente valida URL exacta, frame principal, versión y método, y devuelve metadatos sin rutas ni bytes. Conservar esta política, no ampliar bridge sin amenaza/permiso.
- **P2 i18n:** bootstrap nativo respeta `wivra.lang` existente y solo escribe idioma inicial en archivo local; seis idiomas nativos enumerados. Verificar consistencia con idiomas del editor y test manual de persistencia.
- **P2 configuración:** proyecto XcodeGen fija MetaDAT 1.0.1, iOS 17.2+, y bundle ID experimental; `Info.plist` declara cámara, micrófono, Bluetooth, red local y background modes. Las declaraciones de background **no prueban** grabación background; revisar necesidad real de cada entitlement antes de publicar.
- **CI:** `.github/workflows/wivra-complete-beta-assembly.yml` ensambla Android APK debug e IPA **sin firmar** solo después de contratos; incluye comprobación del editor reproducible. El YAML usa `workflow_dispatch` y ruta de push de rama de ensamblaje diferente de rama auditada; la auditoría actual **no aporta build exitoso**.
- **Evidencia histórica:** `streaming/ios/B0/README.md` registra builds iOS simulator y ARM64 unsigned previos en runs 38459815766 y 38480299219; esos runs **no validan** HEAD actual, iPhone físico ni Ray-Ban.

**Conclusión de este bloque:** el contenedor iOS es una integración parcial con un editor único, no dos editores. La unión captura → biblioteca → importación real → exportación es la brecha principal; no certificar beta hasta E2E firmado.

## Hallazgo prioritario · trabajo de Claude interrumpido / rama divergente
Comparación GitHub **`chatgpt/wivra-unified-owner-20261016...claude/beta-editor-integration`**: estado `diverged`, **7 commits propios de Claude**, 91 de integración no incluidos en Claude y **28 archivos diferentes** (incluyendo dist masivo). **NO fusionar a ciegas**: se perderían correcciones de exportación, velocidad, seguridad BYOK o integridad del bundle.

**Trabajo de Claude realmente publicado en esa rama, NO presente aún en la beta auditada:** `app/music-lib.mjs` (seis pistas sintetizadas originales, WAV), `app/whisper-engine.mjs` + `app/transcribe.mjs` (transcripción local WASM), `app/vendor/whisper/libmain.mjs` y avisos de licencia, nuevas plantillas `collage`, `burst`, `beforeafter`, `top3`, y pruebas `music-lib`, `collage`, `slots`, `transcribe`. La rama contiene también una versión propia de `planSpeedAll`, exportación y `app/dist/agentcut.html`; NO sustituir por estos archivos sin comparación semántica. El último commit de `claude/a11y-basics` sí es ancestro de nuestra rama: **no falta ese trabajo**.

**Bloqueadores detectados en la implementación de Claude:**
- `app/whisper-engine.mjs` declara expresamente que **no hay hash SHA256 verificado** de los modelos remotos: comprobar cabecera ggml y tamaño ±40 % no es integridad criptográfica. No habilitar descarga de modelos sin verificación fuerte/procedencia y consentimiento.
- `app/build.mjs` en Claude añade la biblioteca WASM mediante `/*__WHISPER_LIB__*/` y agrega tres módulos. Sin reconciliarlo, importar solo UI o JS deja el editor roto.
- `app/templates.mjs` reimplementa transformaciones de timeline/audio: revisar casos música no ligada, clips ya acelerados y posiciones/recortes antes de integrar.
- Tests de Claude son **código publicado, no ejecución verde en nuestra rama**. Requieren Node, reproducibilidad de HTML, E2E WebView y QA real.
- Comparación de `claude/test-merge-54-20261015` también divergente, pero sus archivos no demuestran una versión más reciente o completa; revisar precedencia por contenido y ancestros, no por nombre.
**Decisión de auditoría:** preservar rama de Claude intacta y preparar integración selectiva, conservando fixes de ChatGPT y un solo editor; no tocar `main`.

## Integración selectiva ejecutada · música Claude
- `app/music-lib.mjs` importado **sin reemplazar** los módulos de exportación, velocidad, plantillas ni captura: commit `a77b1d9`.
- `app/tests/music-lib.test.mjs` recuperado: commit `dab769b`. Verifica catálogo, duración, amplitud, determinismo, RIFF PCM16 y casos inválidos; **pendiente resultado de CI en esta rama**.
- `app/build.mjs` incluye el módulo de música para que el HTML de editor pueda usarlo: commit `1102143`. La interfaz de selección de pistas **aún no está conectada**. No afirmar que la música ya está disponible al usuario.
- Workflow existente `wivra-audit-rebuild-editor.yml` reconstruye el HTML y ejecuta pruebas en push a la rama; confirmar que el bot haya podido actualizar `app/dist/agentcut.html` y que el ensamblaje integral pase antes de anunciar beta.
- La rama de Claude se conserva intacta. Whisper y plantillas especiales permanecen pendientes de integración y revisión.

## Integración selectiva ejecutada · plantillas Claude
- `app/templates.mjs` fusionado **por secciones**: catálogo de 10 plantillas, planificadores `collage` y `slots`, y rutas correspondientes en `planTemplate`. Conservados imports, pantalla+cara y montaje previo. Commit `ab3e0a3`.
- Pruebas de Claude recuperadas en `app/tests/collage.test.mjs` y `app/tests/slots.test.mjs`: commits `84aba3f` y `ac20fe7`. La rama de Claude sigue intacta.
- **No declarar UI completa:** `app/template.html` no ha incorporado aún los controles de las plantillas nuevas. **No declarar tests verdes:** falta confirmación de ejecución CI, HTML generado y hardware.
- Siguiente: conectar catálogo y biblioteca musical a interfaz única, reconstruir bundle, corregir CI; luego Whisper con hash de modelos y validación de worker.

## CI inspeccionado · regresiones confirmadas
GitHub Actions en commit `ab3e0a3`: run App Tests `38977996441`, job `117231943694`: **258 pruebas, 256 pasan, 2 fallan**. 
1. `not ok 221`: falta el control `id="spAll"` de **velocidad a todos los videos** en el HTML final. `app/speed.mjs` tiene `planSpeedAll`, pero `app/template.html` aún usa solo `planSpeed`. Es una **regresión real de interfaz**.
2. `not ok 228`: prueba de traducción de errores del cliente IA fallida, incluido el mensaje de reintentos; revisar `app/ai-client.mjs`, claves de i18n y test antes de cambiar cadenas.
Run UI Smoke `38977996566` también falla al comparar bundle HTML obsoleto contra fuentes; diferencia mostrada incluye UI de velocidad. La reconstrucción automática **no está confirmada**.
**Intento de reparación:** escritura completa de `app/template.html` (~260 KB) para conectar biblioteca musical mediante `addTrackFile` y rol `music` fue bloqueada por herramienta antes de commit. **Ninguna edición de interfaz fue publicada**. Reintentar por mecanismo de parche seguro, no fingir integración UI.
**Prioridad:** corregir `spAll`, fallo i18n, reconstruir `app/dist/agentcut.html`, ejecutar CI y recién entonces conectar biblioteca musical y Whisper.

## Reparación CI · 16 octubre, bloque siguiente
Logs run `38978834240` de App Tests muestran fallos adicionales tras recuperar pruebas de Claude: `speedOf is not defined` en collage, `tr is not defined` en slots, y dos mensajes de validación HTTPS no traducidos a siete idiomas. `app/dist/agentcut.html` todavía no tiene `id="spAll"`, aunque `app/template.html` sí lo tiene: **bundle generado obsoleto**.
- Corregido `app/templates.mjs`: importar `speedOf` y entregar traductor identidad al planificador de slots, commit `d9cb612`.
- Corregidas tablas `app/i18n/strings-it.tsv` y `app/i18n/strings-3.tsv` para dos errores HTTPS, commits `8a92364` y `4d7f29a`. No se debilitó la validación de URLs.
- Aún sin confirmación de nuevas pruebas: no reportar CI verde.
- Bloqueador P0: ejecutar `node app/build.mjs` en runner con permisos de commit, sincronizar `app/dist/agentcut.html`, luego ejecutar `node --test app/tests/*.test.mjs` y ensamblaje móvil. El workflow de reconstrucción existe pero su ejecución efectiva no está demostrada; no sustituir evidencia de compilación con inspección estática.

## CI posterior a corrección i18n · fallos precisos
Run `38979793764`, App Tests: **271 tests, 263 pasan, 8 fallan**. Seis errores (`not ok 199–204`) debidos a `qaLinkedAudioOps is not defined` en slots; reparado import desde `quick-assembly.mjs` en commit `76b7da3`. Otros dos (`not ok 234–235`) son exclusivamente bundle `app/dist/agentcut.html` obsoleto respecto a `app/template.html` y las traducciones; `spAll` sí existe en fuente.
- El workflow `wivra-audit-rebuild-editor.yml` fue ampliado para observar también `app/tests/**` y `app/dist/agentcut.html`, commit `e932834`; aún no existe evidencia de ejecución exitosa o commit de bundle.
- No confundir el total de 8 fallos con 8 causas distintas. Bloqueadores: verificar que el runner de rebuild realmente arranque, ejecute suite, y pueda subir bundle sin carrera con otras escrituras. La beta móvil permanece no validada.

## Bloque auditoría y automatización posterior
- App Tests run `38982403400`: **269/271** aprobadas, fallan exclusivamente las guardas del bundle final (`spAll` ausente y traducciones obsoletas). Importaciones `speedOf`, `tr`, `qaLinkedAudioOps` ya no figuran como fallos.
- Mobile Assembly run `38982403453`: suite inicial falla antes de iniciar trabajos `Android APK` e `iPhone arm64 IPA UNSIGNED`, ambos `skipped`. No hay instaladores nuevos verificados.
- Actualizado workflow de reconstrucción `wivra-audit-rebuild-editor.yml` para aceptar también PR interno dirigido a la rama base de integración y proteger escritura con validación de head ref y repo, commit `e83c885`. Su ejecución y permisos efectivos aún requieren confirmación; no afirmar que el bundle esté sincronizado.
- Riesgo operativo: GitHub Actions de PR puede no cargar workflows añadidos solo en head, o tener permisos de escritura restringidos; si no corre, usar un flujo autorizado de reconstrucción que efectivamente pueda commitear el HTML generado, sin forzar pushes ni saltar pruebas.

## Bloque adicional: regeneración del HTML en CI
- Commit `c9c0e5c`: workflow existente `.github/workflows/app-tests.yml` reconstruye `app/dist/agentcut.html` con `node app/build.mjs` antes de `node --test app/tests/*.test.mjs`, y adjunta HTML como artefacto de 7 días.
- El cambio permite comprobar el código fuente real en la suite sin depender de un HTML antiguo del repositorio. **No sincroniza todavía el archivo versionado**; debe realizarse commit del bundle generado en la rama de integración después de verificarlo. No hay evidencia de 271/271 aún.
- Separar: CI de editor, artefactos Android/iOS y QA físico. Mantener estado pendiente hasta pruebas verificadas.

## Verificación automatizada satisfactoria posterior
- Workflow `Wivra Audit · Rebuild Editor Bundle` run `38984681705`: `success`; logs registran **271 passed / 0 failed**. HTML versionado `app/dist/agentcut.html` consultado en rama de integración: contiene `id="spAll"` y tamaño ~808 KB.
- `App Tests` run `38984681693`: `success`.
- `Wivra Complete Beta Assembly (Mobile)` run `38984681721`: etapa `Editor + Director + Native Contract Suite` `success`; trabajos `iPhone arm64 IPA · UNSIGNED` y `Android APK` todavía `in_progress` en consulta. No afirmar artefactos instalables antes de su conclusión.
- Auditoría de dependencias remotas: `app/ai-client.mjs` declara proveedores BYOK HTTPS; `app/persist.mjs` y `app/subtitles.mjs` no contienen endpoints HTTP directos. Esto no constituye una auditoría de red completa.
- Usuario pospone pruebas manuales hasta disponer de beta. No bloquear integración por pruebas que requieren dispositivo; documentar y realizar al final.

## Compilación iOS comprobada (sin firma)
- `Meta B0 iOS Native Build` run `38984681698`: trabajo `compile-ios` **success**.
- Artefacto GitHub Actions `WivraMetaB1-UNSIGNED-arm64`, ID `12082463594`, 6,172,528 bytes, SHA-256 del archivo de artefacto publicado por GitHub `6842401798dbe0b7c806ec262be79d833e0c005ff35824740600872c3e498976`, expiración 2026-10-24 UTC. **No firmado**, por tanto no es instalador listo para el usuario ni acredita pruebas físicas.
- El ensamblaje completo run `38984681721` superó contrato nativo pero trabajos de empaquetado quedaron `cancelled`; auditar por separado. Android run `38984681709` seguía ejecutándose al consultar.

## Builds nativos completados (17-10-2026 UTC)
- Android `Wivra Unified Android Native Build` run `38984681709`, job `android-editor-shell`: **success**. Artefacto `WivraUnifiedAndroid-DEBUG` ID `12082785569`, ZIP de 16,070,871 bytes, digest del artefacto `sha256:e6e732c413a87fce172380495ab67c8e2ccfceab6973887ee14c2e61570823e4`; expira 2026-10-24 UTC. No equivale a QA en dispositivo.
- iOS run `38984681698`: **success**, artefacto arm64 sin firmar registrado arriba. Requiere firma/provisioning para instalar en iPhone.
- `Wivra Complete Beta Assembly (Mobile)` run `38984681721`: suite inicial `success`, pero trabajos de paquetes completos `cancelled`; por tanto, no afirmar que la beta ensamblada final esté lista.
- Pruebas manuales pospuestas por decisión del propietario hasta la etapa final. No solicitar intervención antes de que sea necesaria.

## Corrección del flujo de ensamblaje de beta
- El workflow `.github/workflows/wivra-complete-beta-assembly.yml` tenía `concurrency.cancel-in-progress: true`, lo que permite cancelar empaquetados Android/iOS al llegar otra ejecución del mismo PR/ref. Es una **causa plausible**, no demostración concluyente, de los dos jobs `cancelled` en run `38984681721`.
- Commit `bd6f90ca2151bd6e50554b2b639f6a82dd74ad25`: `cancel-in-progress: false` y activación `push` para la rama de integración `chatgpt/wivra-unified-owner-20261016`. Debe confirmarse con una nueva ejecución completa y artefactos publicados.

## Nueva revisión: localización de la interfaz nativa iOS
- El proyecto exige ES/EN/PT/FR/DE/JA/ZH/IT. `streaming/ios/B0/Resources/es.lproj/Localizable.strings` existe, pero `Resources/pt.lproj/Localizable.strings` y `Resources/zh.lproj/Localizable.strings` no existen en la rama de integración a esta revisión. El workflow de beta iOS solo comprueba `es en fr de it ja`, por lo que una compilación verde no garantiza ocho idiomas en la interfaz nativa.
- El editor HTML tiene su propia localización; **no confundir idiomas del editor con traducciones del shell iOS**. Completar PT/ZH y ampliar la puerta de CI a los ocho antes de declarar localización finalizada.
- Tras corregir `cancel-in-progress`, nuevo run de ensamblaje `38988203542` encolado; no atribuir éxito hasta ver trabajos Android/iOS y artefactos.

## Ocho idiomas y nueva ronda de integración
- Archivos `streaming/ios/B0/Resources/{es,en,pt,fr,de,ja,zh,it}.lproj/Localizable.strings` verificados en la rama: **59 claves `ios.*` en cada idioma**. Este recuento verifica cobertura de claves, no revisión lingüística ni presentación en dispositivos.
- SHA `45966edaba5f0d2063de56f62ec73a2bae4de496`: Actions `App Tests` run `38989859101`, `Wivra Audit · Rebuild Editor Bundle` `38989859189`, `Meta LIVE Preflight Tests` `38989859090`, `Local Visual Evidence Tests` `38989859107`, `In-App Director and Editor Controls` `38989859066`, `Creative Director Brief Tests` `38989859146`, `Wivra AI Chat-First UI Smoke` `38989859075` y `Meta B0 iOS Native Build` `38989859305` reportan `success`.
- `Wivra Complete Beta Assembly (Mobile)` run `38989859058`: suite integrada `success`, empaquetados Android e iOS `in_progress` al revisar. Android independiente `38989859176` en ejecución. No afirmar artefactos completos antes de verificarlos.

## Ensamblaje completo aprobado: run 38989859058
- `Editor + Director + Native Contract Suite`: `completed/success`.
- `Android APK · same unified editor`: `completed/success`. Artefacto `Wivra-BETA-Android-DEBUG-apk`, ID `12084322754`, 16,070,869 bytes, no expirado al comprobar.
- `iPhone arm64 IPA · UNSIGNED`: `completed/success`. Artefacto `Wivra-BETA-iOS-UNSIGNED-ipa`, ID `12084832004`, 6,177,018 bytes, no expirado al comprobar. **No instalable en iPhone sin firma**.
- `Wivra-BETA-Assembly-Status`: ID `12084686756`, 499 bytes. Android independiente run `38989859176` `success`, artefacto `WivraUnifiedAndroid-DEBUG`, ID `12085235062`.
- El éxito de CI prueba ensamblaje y contratos automatizados, no uso real de cámaras, gafas, micrófonos, LIVE ni exportación en hardware. Mantener esas verificaciones abiertas hasta QA de dispositivos.

## Biblioteca musical conectada al editor
- Commit `9a71c43fc390d1b2512a52b947ecee30e76f4c39`: `app/template.html` incorpora selector de `MUSIC_TRACKS` y botón que genera WAV local con `musicWav`, lo convierte en `File` y usa `addTrackFile(..., 'audio')` para respetar el flujo existente de pistas y archivos.
- En la primera CI de ese commit, `App Tests` run `38991607698` **success**, pero los smoke/contratos y ensamblaje fallaron por `git diff --exit-code -- app/dist/agentcut.html` tras reconstruir un bundle obsoleto. El workflow de reconstrucción run `38991607674` finalizó **success** y una lectura posterior de la rama confirmó `wivraMusicAdd` en `app/dist/agentcut.html` (~809 KB).
- La generación de música, uso de memoria, reproducción y exportación en WebView física **no están validados**. Comprobar nuevas ejecuciones CI posteriores al commit automático de HTML antes de cerrar regresión.

## Accesibilidad de plantillas y sincronización del bundle
- Commit `ee8a4127b54845e0e7dee65b5472d8aed4b68661`: botones de las diez plantillas incorporan `title` y `aria-label` con su descripción.
- CI de ese SHA: `App Tests` run `38991740587` y `Meta LIVE Preflight Tests` run `38991740590` terminaron en success. Otros flujos fallaron en la primera ejecución; el workflow de reconstrucción `38991740564` terminó en success. La lectura posterior de `app/dist/agentcut.html` confirmó `b.title = t.desc`.
- Pendiente: confirmar CI en un SHA posterior y VoiceOver/TalkBack en dispositivos reales.

## Android · importación de capturas con WAV (continuación 16-10-2026)
- Brecha encontrada: el selector Android ofrecía MP4 y WAV por separado; `input#capFile` requiere manifiesto JSON y medios a la vez. Las grabaciones sincronizadas quedaban sin enlace en la línea de tiempo.
- Se implementó catálogo bajo demanda de pares previamente **guardados** por el propietario. Se comprueba su procedencia en MediaStore mediante `OWNER_PACKAGE_NAME`, `IS_PENDING=0` y URI de publicación en sidecar privado. Un manifiesto v2 reducido se entrega mediante `FileProvider` privado, con video y WAV publicados como los otros dos URI. Ningún audio/video grande se copia a caché ni se pasa ruta a JavaScript.
- Sólo se ofrece a `input#capFile` (selector múltiple de JSON); se conserva el selector de archivos y el importador multipista de Claude. Audio y video en espera no son seleccionables.
- La prueba de contrato coteja la estructura nativa con el importador JS, incluido desplazamiento de WAV de 0,22 segundos. **Pendiente** verificación CI Android/ensamblaje y QA física de tiempos, WebView/ContentProvider, permisos y recuperación. La precisión de inicio WAV/CameraX sigue estimada.

## Exportación · fallo seguro para voces independientes
- `recordProject` ahora ejecuta `exportAudioPreflight` antes de iniciar MediaRecorder. Cuando una voz/audio independiente no pudo decodificarse o el navegador no puede crear una salida de audio requerida, interrumpe antes de gastar tiempo ni producir un archivo engañoso.
- El editor advierte las pistas perdidas y sólo permite proseguir sin ellas cuando el propietario marca expresamente `expAllowAudioGaps`. Se restablece desmarcado en cada exportación, se conserva el aviso final y no se modifica el material fuente.
- Nuevas pruebas unitarias verifican WAV faltante, falta de AudioContext, proyecto silencioso, pistas silenciadas y mezcla correcta. **Pendiente** bundle generado en `app/dist/agentcut.html`, CI y pruebas de exportación reales en WebView.

## Reconciliación documental y bundle, 16-10-2026 (continuación)
- `app/README.md` corregido: sus afirmaciones iniciales «No exporta todavía», «no hay mezcla de audio» y «no se separan canales» ya eran históricas y contradictorias con `app/export.mjs`, `app/channel-split.mjs` y la integración Android nueva.
- `app/tests/export-audio-preflight.test.mjs` comprueba también que el HTML fuente y el generado contienen la casilla de autorización, desmarcada de inicio, y la ruta de bloqueo. La exportación silenciosa no puede convertirse en éxito por una diferencia de bundle.
- El HTML determinista fue regenerado automáticamente por el workflow en commit bot `5ef6a698`; los workflows que arrancan desde ese commit de `github-actions[bot]` aparecen `action_required`, no equivalen a pruebas ejecutadas. Esta actualización desde el propietario debe activar una ronda de CI normal. Estado de beta física permanece PENDIENTE.

## Integración de capturas Android y localización (continuación)
- Dos nuevas traducciones nativas completas (PT/ZH, 152 cadenas por idioma) y tres etiquetas nuevas en los ocho idiomas, con prueba de paridad de claves y parámetros. Eliminada la descripción de accesibilidad codificada en español del botón Ray-Ban Meta y la etiqueta fija '+ WAV'.
- `WivraCaptureImport` valida nombres de archivos publicados en MediaStore, evita enlaces simbólicos y escribe manifiestos JSON de forma segura usando `Files.createTempFile` + `Files.move` en la caché privada. Nunca copia medios grandes ni acepta grabaciones sin decisión de Guardar.
- `savedPhoneMp4AndWavBecomeOneReadableCaptureManifest` agrega ensayo de instrumentación Android del recorrido video/WAV sintéticos → publicación MediaStore → manifest v2 en FileProvider → lectura ContentResolver. Confirma el offset aproximado +0,22 s. Los tests instrumentados se **compilan en CI pero no se ejecutan** sin emulador/dispositivo.
- Mantener pendientes QA física, sincronización larga, Ray-Ban, LIVE, comportamiento al volver de segundo plano y corrección lingüística manual.

## Integridad de publicación Android MP4/WAV
- `WivraPhoneMediaStore.publishPair` antes hacía visible MP4+WAV y después intentaba guardar los URI de asociación en el sidecar con un `catch` silencioso. Eso podía dejar dos archivos publicados sin relación con la importación multipista.
- Ahora persiste `publishedVideoUri` y `publishedAudioUri` en sidecar autenticado antes de publicar, con reemplazo temporal atómico, rechazando manifiesto inválido o enlace simbólico. Si falla la persistencia, revierte ambas filas MediaStore y conserva los archivos originales en privado; se evitan pérdidas silenciosas de la identidad de la pista. En caída del proceso, MediaStore no ofrece una transacción real de varios recursos: sigue siendo posible un elemento pendiente hasta limpieza de Android.
- Regresión estática exige orden sidecar → visibilidad → borrado privado; instrumentación comprueba el recorrido real en Android cuando se ejecute en emulador/dispositivo. CI/QA físico pendientes en este commit.

## Corrección Kotlin observada en GitHub Actions
- `Wivra Unified Android Native Build` run `39009671382` falló al compilar `WivraCaptureImport.kt:84`: `Unresolved reference 'writeString'`. No era un fallo de recursos ni del contrato: Android no expone esa variante de Files bajo la configuración de compilación. Sustituido por `Files.write(tmp, text.toByteArray(Charsets.UTF_8))` en ambos módulos, manteniendo la escritura temporal y el movimiento atómico. Regresión adicional para evitar reintroducir esa API. Nueva CI pendiente.

## Procedencia del micrófono, WAV → manifiesto Android → editor
- Reparación: la selección activa USB/Bluetooth/cable se había monitorizado con AudioRecord, pero el manifiesto exportado mentía identificando siempre `android-phone-mic`. El audio independiente ahora guarda categoría del dispositivo seleccionado, nombre de entrada local y desfase estimado. El importador reconoce sólo categorías conocidas, limita el nombre y conserva información compatible con `app/capture-manifest.mjs`.
- Categorías: `android-phone-mic`, `android-wired-mic`, `android-usb-mic`, `android-bluetooth-mic`; modo predeterminado `android-system-mic` porque no se ha verificado cuál eligió el SO. No atribuir grabación de audio a Ray-Ban DAT. El dispositivo elegido continúa supervisado en cada lectura; el cambio de ruta invalida WAV.
- Nuevos contratos JS revisan propagación de procedencia y offset negativo. Pruebas reales con accesorios Bluetooth/USB y deriva larga siguen pendientes.

## iOS · separar el selector de video normal del importador de capturas
- Hallazgo: `WKOpenPanelParameters` solo expone `allowsMultipleSelection` y `allowsDirectories`, no los MIME `accept` del HTML; ambos inputs `#file` y `#capFile` admiten múltiples archivos. El selector anterior ofrecía un paquete JSON/MOV/CAF también para el input de videos estándar, causando importación equivocada o perdida de audio.
- El editor local inyecta en el documento principal un marcador booleano que se actualiza con el clic real sobre `input[type=file]`; el `WKUIDelegate` autorizado lee exclusivamente `window.__wivraCaptureInputIntent === true` y ofrece paquetes de captura **sólo** para `#capFile`. `#file` conserva el explorador del sistema, sin rutas ni medios privados devueltos a JS. Sin segundo editor.
- La prueba de regresión exige que `offerCaptureBundles` gobierne los paquetes, no `allowsMultipleSelection` a secas. La intención es un dato booleano local, nunca una ejecución de JS arbitraria. Comprobar compilación Xcode y selección real en WKWebView; la recepción de múltiples URLs sigue pendiente de QA física.

## Corrección de semántica JSON null en procedencia del micrófono
- `JSONObject.optString("selectedInputName")` puede devolver el texto "null" para `JSONObject.NULL`. Ahora se usa primero `raw.isNull("selectedInputName")`: el modo automático queda con nombre de entrada **null real**, no un micrófono ficticio llamado «null». Regresión añadida a contrato del importador Android.

## Endurecimiento y prueba de captura iOS/Android
- iOS: `WKUIDelegate` presenta la hoja desde el controlador realmente visible cuando el editor está dentro de un sheet de SwiftUI. El escáner de capturas no ofrece archivos no regulares ni de 0 bytes, aun cuando tengan un manifiesto. Se mantienen los controles de symlink y ruta.
- Android: el test instrumentado existente ahora verifica que los metadatos sintéticos de una entrada USB seleccionada lleguen del sidecar al manifiesto y sus pistas; **no constituye una prueba física de micrófono USB**.
- Ambas pruebas requieren CI actualizada y la instrumentación debe ejecutarse en un emulador/dispositivo antes de declarar validación física.

## Scanner de capturas iOS: integridad del manifiesto previo a la importación
- Se limitan manifiestos locales a 128 KiB, identidades de captura a 200 caracteres y 32 pistas. Además del basename seguro y directorio privado, se rechazan los enlaces simbólicos de entrada, archivo de 0 bytes, IDs de pista repetidos, canales imposibles, offset/sampleRate no finitos y referencias a pistas inexistentes o MOV combinado ausente.
- Un manifiesto corrupto ya no se anuncia como captura lista para WebKit y no puede consumir memoria sin límites mediante `Data(contentsOf:)` para JSON arbitrariamente largo.
- La versión actual sigue requiriendo pruebas en dispositivo iOS para verificar el panel, descodificación CAF/HEVC y persistencia de recursos.

## Integridad de importación multipista en editor (continuación 17-10-2026)
- Hallazgo: el importador HTML aceptaba video aun cuando faltaba una pista WAV/CAF declarada, ejecutaba las operaciones restantes y mostraba `Captura importada`. Eso podía ocultar pérdida de voces. `captureSelectionPlan` comprueba archivos seleccionados por nombre, duplicados y ficheros de 0 bytes antes de leer multimedia o modificar la línea de tiempo.
- Si faltan pistas independientes, se bloquea la importación. Como alternativa segura, si existe un MOV combinado y **todos** los audios ausentes figuran explícitamente en `muxedFromTrackIDs`, se importa el MOV con esas pistas integradas sin duplicar audio. Un MOV no sustituye una voz externa no mezclada.
- Si la decodificación/splitting produce `planImportOps.skipped`, el editor detiene la operación antes de `run(out.ops)` y explica qué pistas faltan, sin presentar un éxito parcial. Puede haber assets previamente procesados en el catálogo de la sesión; no se modifica la línea de tiempo. La limpieza transaccional completa del cache de assets sigue pendiente.
- Se limita a 128 KiB el JSON seleccionado manualmente, consistente con el escáner iOS. Se agregaron pruebas del contrato de selección y del HTML fuente y generado. La ejecución real de WebView/WKWebView y persistencia deben probarse en hardware; no declarar sincronización física.

## Regresión de bundle determinista detectada en CI y corregida
- GitHub Actions del commit `4a978f07` mostró `git diff --exit-code -- app/dist/agentcut.html`: el nuevo helper `captureSelectionPlan` estaba en el módulo ESM, pero no en el HTML embebido; el editor HTML no podía invocarlo. Se sincronizó el helper respetando la eliminación de `export` de `app/build.mjs`.
- Test corregido para informar los **dos** WAV ausentes en el caso hipotético (audio original no presente + voz invitada no mezclada). El comportamiento esperado era correcto; la expectativa del test omitía uno.
- La compilación y la suite deben comprobarse de nuevo sobre este SHA antes de declarar éxito.

## Recuperación de una importación no aplicada (17-10-2026)
- Si la lectura de WAV/CAF o separación de canales falla antes de ejecutar `run(out.ops)`, los archivos previamente decodificados podían persistir como assets huérfanos en el proyecto y sus instantáneas de deshacer/rehacer.
- `importCapture` ahora acumula los IDs de assets añadidos durante ese intento. Al abortar, conserva cualquier asset que ya esté referenciado por clips del proyecto o del historial y libera únicamente los nuevos no utilizados en todas las instantáneas, recursos `blob:` y `mediaFiles`. Si se creó una sesión vacía exclusivamente por el intento, se descarta. El contador de IDs mantiene monotonía para evitar colisiones.
- Se conserva un único batch para timeline cuando todas las pistas requeridas se abren. Los cambios son locales; ninguna captura nativa original se borra o altera. Pruebas de contratos adicionales en HTML fuente y generado; la restauración de IndexedDB y WebView física requiere QA.

## Prevención de audio repetido en el manifiesto multipista
- `parseManifest` ahora **rechaza** un mismo archivo de audio referenciado por varias pistas con el mismo `channelIndex` o una mezcla de canal completo `null` y canales individuales. Antes sólo avisaba y permitía insertar voces duplicadas en el timeline, especialmente con receptores USB estéreo. Los dos canales diferentes L/R siguen siendo válidos.
- Contratos unitarios actualizados y HTML generado sincronizado. No se modifica la grabación original ni se inventan capacidades de hardware.

## Cierre de flujo captura → timeline → persistencia → exportación segura (17-10-2026)
- Hallazgo: cuando la voz primaria o invitada terminaba después del último fotograma del video, la exportación acortaba correctamente el contenedor al video, pero **cortaba la voz sin advertencia** aunque el WAV hubiera decodificado perfectamente. Ejemplo: offset de captura demasiado grande, o voz de entrevista prolongada durante edición.
- `exportAudioPreflight` ahora detecta sólo voces primarias/invitadas activas con tramo más allá del final visual (>50 ms). Devuelve `truncatedVoices` con segundos de voz que se perderían y bloquea MediaRecorder, como los bloqueos preexistentes por audio sin decodificar, hasta corrección del timeline o consentimiento explícito del usuario. Música más larga que el video continúa recortándose automáticamente, sin colas negras ni bloqueos innecesarios.
- La UI advierte y comunica segundos de voz truncados; casilla de aceptación continúa desmarcada. No se cambia el original ni se requiere API remota.
- `app/tests/capture-export-roundtrip.test.mjs` prueba la cadena completa **en objetos y contratos JS**: Android MP4+WAV → selector → timeline multipista → serialización/reapertura → preflight de exportación; iOS MOV mezclado y CAF ausente con autorización explícita del manifest; pérdida de voz fuera del metraje. Es simulación, no prueba de cámaras/WebViews/hardware.
- Código, plantilla y `app/dist/agentcut.html` editados en conjunto. Confirmar reproducibilidad del generador y CI sobre este SHA.

## Ejecución instrumentada de integración MediaStore en emulador Android
- Antes el pipeline solo `assembleDebugAndroidTest` compilaba WivraPhoneMediaStoreTest y nunca lo ejecutaba, por lo que la publicación MP4/WAV y la apertura real de FileProvider eran exclusivamente contratos de fuente.
- `.github/workflows/wivra-complete-beta-assembly.yml` ahora incluye un job separado que instala el APK Debug y el APK de instrumentación en **Android Emulator API 35** y ejecuta `com.oswhgo.wivra.WivraPhoneMediaStoreTest`. Solo finaliza verde si `am instrument` devuelve `OK (N tests)` sin fallos; resultados guardados como artefacto.
- Motor de emulador de código abierto Apache-2.0 `ReactiveCircus/android-emulator-runner` fijado al commit `a421e43855164a8197daf9d8d40fe71c6996bb0d`. Se ejecuta en un runner estándar Ubuntu de GitHub para este repositorio público; no se habilitan servicios comerciales ni laboratorios de dispositivos externos.
- Esta prueba usa contenido AV sintético y ejecuta APIs reales del SO virtualizado, **no valida cámara, voz, WebView físico, Ray-Ban Meta, LIVE o sincronía de minutos**. Resultado efectivo aún pendiente de verificación en Actions del nuevo SHA.

## Corrección de prueba CI: ruta de workflow
- La ejecución de `Meta LIVE Preflight Tests` del SHA `ff4e7b8c` detectó una ruta de lectura errónea en el test nuevo: desde `streaming/tests` el workflow reside en `../../.github/workflows` y no `../../../.github/workflows`. Corregida la referencia; la regresión no provenía del módulo LIVE ni de captura nativa. También se corrigió un texto en castellano del aviso de exportación.

## Corrección de lanzamiento de prueba instrumentada Android
- En run `39058232313`, el emulador Android API 35 arrancó e instaló APKs correctamente; falló **antes de ejecutar cualquier prueba** porque android-emulator-runner interpreta las líneas del campo script de forma separada. Las continuaciones de shell `\\` partían el comando `adb shell am instrument` y producían `Argument expected after "-r"`.
- Ahora se ejecuta la orden completa en una única línea sin continuaciones, preservando el pipe de log y el gate `OK (N tests)`. No se cambia el APK de producción; solo la invocación de CI. Revalidar la ejecución posterior antes de atribuir éxito.

## Hallazgo **ejecutado** en emulador Android API35
- Run `39058668549`: 3/4 tests instrumentados ejecutados OK; `savedPhoneMp4AndWavBecomeOneReadableCaptureManifest` falló en `Published media pair should be available`. El pipeline correctamente quedó ROJO, aunque las compilaciones iOS/Android y suites JS fueron verdes. Se investiga el desacuerdo entre filas propietarias MediaStore, URI publicado y sidecar privado; no declarar la importación nativa verificada todavía.
- Instrumentación reforzada con aserciones separadas para video/WAV propiedad de Wivra y diagnóstico de los URI publicados, sin datos del usuario (archivos y medios sintéticos en emulador), antes de la consulta a `WivraCaptureImport.bundles`. El siguiente resultado permitirá aislar la causa y corregir producción.
