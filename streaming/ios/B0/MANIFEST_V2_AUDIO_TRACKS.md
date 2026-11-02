# Wivra manifest v2 · pistas de audio sin inventar capturas

Coordinación: [issue #49](https://github.com/Os-WHGo/Wivra/issues/49).

## Estado exacto
- **IMPLEMENTADO en código Swift:** modelo y escritor **schemaVersion=2**, con array `tracks`, roles, fuentes, archivo relativo, índice de canal opcional, tasa y número de canales **medidos**, input y offset estimado por pista. Se conservan campos antiguos para lectores B1B y `muxedFromTrackIDs` identifica el audio que se incluyó en el MOV combinado para que el editor no lo reproduzca dos veces.
- **CAPTURA REAL IMPLEMENTADA SOLO A NIVEL PROTOTIPO:** un sidecar HFP `.caf` cuando hay permiso y muestra válida; por tanto la grabación actual genera **0 o 1** audio tracks. Compilación simulador/iPhone sin firma no prueba que funcione la captura en hardware.
- **NO IMPLEMENTADO:** captura DJI USB-C, 2 canales independientes, micrófonos USB genéricos, mesa DJ, mezclador en directo, HFP simultáneo con USB, importación v2 al editor, auto-ducking y pruebas con hardware.
- `originalVideoFile` siempre es el video HEVC original. `muxedVideoFile` es un **preview derivado**, no otra pista original para mezclar. Si hay audio, el campo antiguo `originalAudioFile` refleja la **primera** pista (compatibilidad), pero para v2 Claude debe usar `tracks`.

## Esquema simplificado v2
```json
{
  "schemaVersion": 2,
  "captureID": "uuid",
  "cameraSource": "meta-dat-hevc",
  "originalVideoFile": "clip.mov",
  "muxedVideoFile": "clip.synced.mov",
  "audioSource": "ios-bluetooth-hfp",
  "selectedInputName": "nombre leído del sistema",
  "originalAudioFile": "voice.caf",
  "audioStartOffsetSeconds": 0.085,
  "createdAtISO8601": "2026-10-13T12:00:00Z",
  "tracks": [{
    "id": "audio-1", "kind": "audio", "role": "voice_primary",
    "source": "ios-bluetooth-hfp", "file": "voice.caf",
    "channelIndex": null, "sampleRateHz": 8000, "channelCount": 1,
    "inputName": "nombre leído del sistema", "startOffsetSeconds": 0.085
  }],
  "muxedFromTrackIDs": ["audio-1"]
}
```
**Solo ejemplo sintético:** 8000 Hz y 1 canal arriba son ilustrativos; la app usa los valores reales reportados por la entrada al grabar. Las rutas son relativas al directorio del manifiesto. `channelIndex` empieza en cero; `null` significa usar el archivo completo. La misma ruta puede aparecer en dos pistas para **canales distintos**. `muxedFromTrackIDs` vacío si no se generó MOV combinado.

## Configuraciones futuras (propuesta, no grabadas)
1. **Entrevista DJI**: Ray-Ban HEVC + receptor DJI compatible en modo estéreo que exponga 2 canales separados al iPhone. Audio de un archivo estéreo `.wav` con `tracks[0].channelIndex = 0` (`voice_primary`) y `tracks[1].channelIndex = 1` (`voice_guest`), mismo archivo compartido; **separar a WAV individuales opcional** cuando el capturador exista. Verificar modo estéreo/ruteo USB y sample rate **reales**; no suponer 48 kHz.
2. **DJ/concierto**: pista de voz y pista de música independiente **solo si** la interfaz expone los canales necesarios en **una sola entrada multicanal** o si se sincronizan grabadores independientes después. Una mezcla estéreo desde una sola entrada NO son mágicamente dos stems separados.
3. **HFP de reserva**: el audio HFP no puede marcarse como `scratch` si no fue grabado. Con una ruta USB seleccionada, no prometer capturar HFP al mismo tiempo. Alternativas: scratch grabado en otro dispositivo sincronizado posteriormente o alternar rutas entre tomas.

## Reglas para importación de Claude en el editor (#44)
- Leer `schemaVersion` 1 y 2; si v1, sintetizar en memoria **solo** el track que se corresponda con `originalAudioFile` existente; no reescribir originales.
- Para v2, importar cada entrada de `tracks` como pista editable dentro de **una captura/proyecto**; mantener IDs, roles y offsets, comprobar archivos, formatos y límites de `channelIndex`/`channelCount`.
- Si hay pista canalizada, separar canales de forma no destructiva. No duplicar audio de `muxedVideoFile` cuando ya se usan originales. Dejar que usuario elija mute/solo, niveles y, después, auto-ducking.
- Validar errores de archivo faltante, offset sin reloj, HFP desconectado, canal no disponible y permisos. No convertir un supuesto de hardware en estado «PROBADO».

## Auditoría Meta AI: HFP → Camera
**Abierta, no mezclar con este PR.** El PR #48 comienza el video DAT antes de activar HFP al pulsar Grabar; la documentación de Meta indica preparar HFP antes del stream. Solicitar tercer FINDING sobre secuencia correcta y pruebas con cancelación, consentimiento, ruta perdida, FPS, consumo y reinicio, usando SDK/version exactos. El modo HFP+camera puede reducir FPS o afectar captura de foto según informes de usuarios; comprobar en hardware antes de cambiar el flujo principal.

**Nueva regla:** inspeccionar novedades de la carpeta Drive antes de modificar #44, #48 o nuevas ramas asociadas. Los hallazgos no son instrucciones de ejecución automática: verificar, registrar en #49 y decidir alcance.
— ChatGPT


## Contract-test y sincronización con el lector de Claude (14-oct-2026)

El [PR #44](https://github.com/Os-WHGo/Wivra/pull/44) creó `app/capture-manifest.mjs` basado en un borrador independiente de v2. **Ese lector no es compatible todavía con el JSON que ya escribe el Swift del PR #50.** No basta con que ambos utilicen `schemaVersion: 2`.

La interfaz **canónica provisional** es el formato emitido por `WivraCaptureManifest.swift` de #50, descrito por:
- [JSON Schema de v2](https://github.com/Os-WHGo/Wivra/blob/chatgpt/meta-b1c-tracks-manifest-20261013/streaming/contracts/wivra-manifest-v2.schema.json)
- [Fixtures v2, solo sintéticas](https://github.com/Os-WHGo/Wivra/blob/chatgpt/meta-b1c-tracks-manifest-20261013/streaming/contracts/manifest-v2-fixtures.json)
- [Pruebas de contrato](https://github.com/Os-WHGo/Wivra/blob/chatgpt/meta-b1c-tracks-manifest-20261013/streaming/tests/meta-b1c-manifest-contract.test.mjs)

| Escritor Swift (#50) | Lector Claude actual (#44) | Adaptación requerida |
| --- | --- | --- |
| `role: voice_primary / voice_guest / ambience` | `voice-host / voice-guest / ambient` | Mapear roles al modelo interno del editor, conservar el valor fuente al importar |
| `sampleRateHz` | `sampleRate` | Leer `sampleRateHz` y preservar metadato |
| `channelCount` | `channels` | Leer `channelCount` |
| `startOffsetSeconds` | `offsetSeconds` | Leer `startOffsetSeconds` y preservar offset estimado |
| `channelIndex` (índice 0-based; puede ser null) | No lee `channelIndex` | Mantener selección de canal; dos TX en un archivo estéreo comparten filename |
| `muxedFromTrackIDs` | No lee este campo | Excluir audio del MOV derivado si sus pistas originales están activas; evitar sonido duplicado |
| `kind: audio`, `inputName` | No preserva ambos | Mantener origen y nombre de entrada auditables |
| `tracks: []` sin audio | Soporta array vacío | Mantener, sin crear pistas ficticias |

La importación debe tolerar **v1** real y **v2** canónico; no añadir claves ficticias para que pase el test. Debe distinguir pistas físicas grabadas de propuestas DJI para futuro. `offsetEstimated` no está escrito por Swift: **todo `startOffsetSeconds` B1C es estimado**, no una medida de sincronía corregida; mantener esa distinción. Para `role=voice_primary` de HFP conservar la naturaleza HFP real, no marcar automáticamente como scratch.

**Cláusula de seguridad:** no abrir archivos por rutas arbitrarias provenientes del JSON: usar únicamente nombres de archivo sencillos y resolver dentro del grupo seleccionado por el usuario. Comprobar existencia, permisos y formato, y advertir si el lector web no soporta CAF/HEVC.

**Estado:** documentación y fixtures del contrato, pruebas automáticas de estructura; NO end-to-end entre app nativa y editor, NO importación de biblioteca, NO hardware probado. Claude mantiene propiedad de `app/`; ChatGPT no modifica su parser. — ChatGPT
