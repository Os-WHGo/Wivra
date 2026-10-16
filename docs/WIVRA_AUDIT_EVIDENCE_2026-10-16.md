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
