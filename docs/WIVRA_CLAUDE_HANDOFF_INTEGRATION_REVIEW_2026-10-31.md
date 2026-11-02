# Wivra | Revisión de traspaso de exportación de Claude (31-10-2026)

**Fuente primaria:** `docs/WIVRA_HANDOFF_CHATGPT_EXPORT_2026-10-31.md` en `claude/wivra-progressive-export-20261030` (PR #132, SHA `10d5575a`). Este archivo es una **revisión de integración**, no un duplicado de la investigación de exportación de Claude.

## Estado de ramas comprobado

- PR #133, `3b49f1e`: base de la integración exportación/captura; **ancestro de Claude**. GitHub compare #133...Claude: 12 commits adelante, 0 detrás; un `merge --ff-only` desde #133 a Claude es válido **solo si la rama de destino sigue en ese SHA**.
- PR #134, `867af42`: captura y verificación nativa de Codex sobre #133.
- PR #135, rama `chatgpt/wivra-capture-prefix-recovery-20261031`: recuperación de prefijos, journaling monótono y recibo estable para Director, **sobre #134**. La rama ya divergió de Claude. No hacer `ff-only` ni fusionar sin verificar el árbol final.
- PR #132, Claude: exportación, contenedores, sincronización, pruebas largas y benchmarks. **No editar su rama ni fusionar a main.**

## Cuatro invariantes de Claude que debe preservar la integración

1. Android `MainActivity.java`: `settings.setMediaPlaybackRequiresUserGesture(false)`. La exportación programática falla en WebView por defecto (demostrado en emulador).
2. iOS `WivraEmbeddedEditorScreen.swift`: `allowsInlineMediaPlayback = true` y `mediaTypesRequiringUserActionForPlayback = []`. Sin QA en iPhone real.
3. iOS `WivraExportNativeBridge.swift`: mantener `excludedActivityTypes = [.saveToCameraRoll]` mientras falte `NSPhotoLibraryAddUsageDescription`; nunca activar un permiso sensible por defecto.
4. `pickMime` conserva H.264+AAC preferido y evita H.264+Opus como MP4 preferido en Android; MP4 fragmentado declara duración solo en `mehd`, no `mvhd/tkhd/mdhd`.

## Requisitos de integración

- Usar un árbol/branch temporal; preservar la historia de ambas ramas, sin force-push.
- Resolver cambios solapados en `MainActivity.java`, `WivraEmbeddedEditorScreen.swift`, `app/export*.mjs`, `WivraExportStore.swift`, workflows y pruebas. Nunca asumir que una rama contiene automáticamente todo lo nuevo de la otra.
- Regenerar `app/dist/agentcut.html` con `node app/build.mjs` si hay divergencia. No resolver HTML generado a mano.
- Ejecutar App/Core/Director, pruebas de browser, emulador Android y build iOS **sobre el mismo SHA final**.
- Mantener `MediaRecorder` como motor de exportación por defecto. El benchmark `WebCodecs + Mediabunny` obtuvo 8,5× en Chromium Linux, pero no hay permiso para reemplazar motor ni QA real; requeriría nuevo `writeAt` o salida secuencial y port de render.
- En caso de conflicto no resuelto, dejar las ramas independientes con un informe preciso; no degradar funcionalidad ni crear una fusión ficticia.

## Trabajo independiente en PR #135

- Los segmentos confirmados sobreviven a errores posteriores de stop, verificación y escritura, sin declarar toma completa.
- `store.save` impide eliminar historial confirmado o reabrir una sesión terminal.
- `directorHandoff` vuelve a leer el journal tras verificar medios y rechaza un recibo desactualizado si un escritor externo lo cambió.
- Pruebas por archivo en `app/tests/capture-native-session.test.mjs` y `capture-journal-store.test.mjs`. CI de este SHA debe confirmarse antes de integrar.

## Límites

Sin grabación real con Ray-Ban/pantalla bloqueada, sin LIVE público, sin QA física iOS/Android, sin firma iOS, sin gastos. Para exportaciones de 10/20/30/60 minutos, distinguir CI Chromium de dispositivos físicos. El usuario decidió evaluar pagos de publicación solo después de tener una beta instalable.
