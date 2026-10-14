# Manifiesto de captura `.wivra.json`: v1 real y v2 propuesto (varias pistas)

> Respuesta de Claude al pedido del issue #49 y a la propuesta de Meta AI (FINDING-AUDIO-DJI-MULTITRACK, Drive).
> Estado: **DOCUMENTADO + lector con pruebas unitarias** (`app/capture-manifest.mjs`). **No** conectado a la interfaz, **no** probado en teléfono, ningún archivo real lo usa todavía. — Claude

## v1 (verificado leyendo `WivraCaptureManifest.swift` del PR #48)
Campos: `schemaVersion`, `captureID`, `cameraSource`, `audioSource`, `selectedInputName`, `originalVideoFile`, `originalAudioFile`, `muxedVideoFile`, `audioStartOffsetSeconds`, `createdAtISO8601`. Un video y como mucho un audio (HFP).

## v2 (propuesta de Meta AI, concretada por Claude; decide el propietario)
```json
{ "schemaVersion": 2, "captureID": "…", "cameraSource": "meta-dat-hevc", "originalVideoFile": "a.hevc", "muxedVideoFile": "a.mov",
  "createdAtISO8601": "…",
  "tracks": [
    { "id": "t1", "role": "voice-host",  "file": "host.wav",  "source": "dji-mic", "sampleRate": 48000, "channels": 1, "offsetSeconds": 0.10, "offsetEstimated": true },
    { "id": "t2", "role": "voice-guest", "file": "guest.wav", "source": "dji-mic", "sampleRate": 48000 },
    { "id": "t3", "role": "scratch",     "file": "a.caf",     "source": "ios-bluetooth-hfp", "sampleRate": 8000 } ] }
```
Roles: `voice-host`, `voice-guest`, `music`, `ambient`, `scratch`, `other`.

## Qué hace el lector (`parseManifest`)
- Acepta v1 y v2 y **siempre entrega la forma v2** (v1 → una pista `scratch`, desfase marcado como estimado).
- Rechaza: versión desconocida, rutas con carpetas o `..`, ids de pista repetidos, roles fuera de lista, frecuencia de muestreo o canales absurdos, JSON roto. Devuelve la lista de errores.
- **No** abre archivos: comprobar que existen y su formato (¿el editor del teléfono lee CAF?) queda para la importación real.

## Lo que sigue (no hecho)
1. ChatGPT decide si el PR #48 pasa a escribir v2 (hoy escribe v1). Mientras tanto el editor lee ambos.
2. Importación: crear un solo objeto de captura con sus pistas (volumen/silencio por pista; ver issue #47).
3. Auto-ducking (bajar música cuando hay voz): idea de Meta AI, **sin implementar**.
4. Dudas abiertas: lectura de CAF/WAV en Safari, desfase real (drift), receptor DJI con iPhone **sin probar** (Meta AI lo marca como propuesta que requiere hardware).
