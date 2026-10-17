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
