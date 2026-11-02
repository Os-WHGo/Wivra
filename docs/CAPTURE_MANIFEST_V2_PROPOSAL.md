# Manifiesto de captura `.wivra.json`: lector del editor (v1 + v2 canónico)

> Estado: **lector con pruebas unitarias** (`app/capture-manifest.mjs`). **No** conectado a la interfaz del editor, **no** probado en teléfono, ningún archivo real de gafas/DJI lo ha usado todavía. — Claude
> Actualizado 14-10-2026: **reconciliado** con el formato que escribe el Swift de ChatGPT (PR #50). Mi borrador anterior (`voice-host`, `sampleRate`, `offsetSeconds`…) quedó **descartado**; no lo escribe nadie.

## Formato canónico provisional
El de `WivraCaptureManifest.swift` (PR #50), descrito por su esquema `streaming/contracts/wivra-manifest-v2.schema.json` y sus ejemplos **sintéticos** `manifest-v2-fixtures.json` (copias en `app/tests/fixtures/`, tomadas del commit 640b701 de la rama de ChatGPT; si cambian allá, hay que recopiarlas). Campos de pista: `id`, `kind:"audio"`, `role` ∈ `voice_primary | voice_guest | music | scratch | ambience | other`, `source`, `file`, `channelIndex`, `sampleRateHz`, `channelCount`, `inputName`, `startOffsetSeconds`; más `muxedFromTrackIDs` a nivel raíz.

## Qué hace el lector
- `parseManifest(json)` acepta **v1** (PR #48) y **v2** y devuelve siempre una forma interna única (`tracks` con `offsetSeconds` y `offsetKnown`). Errores y avisos en español.
- Rechaza: versión desconocida, rutas con carpetas/`..`/vacías/saltos de línea, ids de pista repetidos, `kind` ≠ audio, rol fuera de lista, números inválidos, `channelIndex` ≥ `channelCount`, `muxedFromTrackIDs` que apunta a una pista inexistente o repetida, o sin `muxedVideoFile`.
- **Avisa** (no rechaza): campos nuevos desconocidos (para no romperse cuando el esquema crezca) y varias pistas del mismo archivo sin canales distintos (audio duplicado). Es la **única** diferencia con el esquema JSON estricto (`additionalProperties:false`); en una prueba cruzada con un validador JSON Schema estándar (Ajv) coincidieron en las otras 14 mutaciones probadas × 3 ejemplos.
- v1 → se sintetiza **solo** la pista de `originalAudioFile` (rol `voice_primary`, id `audio-1`) y se marca que el MOV combinado ya la trae.
- `importPlan(manifest, {useMuxed})`: con el MOV combinado **no** se importan aparte las pistas de `muxedFromTrackIDs` (ya suenan dentro del video); con el video original se importan todas. Evita duplicar audio.

## Lo que NO hace / sigue pendiente
- No abre archivos: no comprueba que existan, ni que Safari lea **CAF/WAV**, ni el offset real (es **estimado**), ni el drift.
- No separa canales de un WAV estéreo (`channelIndex`) ni crea pistas en el timeline: eso es el motor multipista (siguiente paso).
- Todo lo de DJI/USB sigue siendo hipótesis hasta una grabación real con hardware.
