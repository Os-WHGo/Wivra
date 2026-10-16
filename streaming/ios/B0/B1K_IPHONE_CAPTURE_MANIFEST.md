# Wivra B1K · manifiesto para MOV nativo iPhone

**Rama:** `chatgpt/iphone-b1k-manifest-20261015`, apilada sobre B1J (#69). Solo captura iOS y pruebas. Sin cambios al editor de Claude, LIVE, `main` ni al contrato JSON v2.

## Lo que se implementó
1. Tras el callback `AVCaptureFileOutputRecordingDelegate.didFinishRecordingTo` y comprobar que el MOV existe y no está vacío, se escribe un `.wivra.json` con el mismo nombre base en `Documents/WivraIPhoneMedia`.
2. El escritor canónico `WivraCaptureManifest.write` acepta el parámetro `cameraSource`; sigue usando `meta-dat-hevc` por defecto para conservar la ruta Ray-Ban previa. El iPhone escribe `iphone-avfoundation`.
3. El MOV registrado es **el original**. `originalVideoFile` apunta al MOV; `muxedVideoFile = null`, `originalAudioFile = null`, `tracks = []` y `muxedFromTrackIDs = []`.
4. **`tracks = []` significa que no se grabó un archivo de audio independiente**, no que el MOV esté mudo. Si el iPhone incorpora audio de micrófono, este permanece **dentro del MOV original**. Este PR no crea CAF de iPhone, no extrae AAC, no inventa muestras, canales, offsets ni pistas físicas.
5. El JSON se escribe de forma atómica **antes** de marcar `isFinishing = false`, de modo que el traspaso a Ray-Ban espera su cierre. Si falla el JSON, se conserva el MOV y se informa sin fingir éxito; el bloqueo finaliza cuando se termina el intento.
6. La pantalla expone `ShareLink` del MOV y del manifiesto por separado. Es una exportación manual, **no** transferencia automática a biblioteca/editor.

## Ejemplo sintético de metadatos (no representa un dispositivo ensayado)
```json
{
  "schemaVersion": 2,
  "captureID": "uuid-generado",
  "cameraSource": "iphone-avfoundation",
  "audioSource": "none",
  "selectedInputName": null,
  "originalVideoFile": "Wivra_ejemplo.mov",
  "originalAudioFile": null,
  "muxedVideoFile": null,
  "audioStartOffsetSeconds": null,
  "createdAtISO8601": "2026-10-15T21:00:00Z",
  "tracks": [],
  "muxedFromTrackIDs": []
}
```

**Precaución:** `audioSource: none` aquí expresa que **no hay sidecar/pista separada declarada**. El audio embebido debe detectarse en el MOV durante la importación real del editor, sin agregar una segunda pista ficticia. El contenido exacto de pistas de medios requiere inspección de AVAsset al importar.

## Validación y pendiente
- Contratos estáticos con Node, compilación Swift mediante GitHub Actions iOS Simulator y arm64; CI solo certifica esos aspectos si termina en verde.
- Sin prueba en iPhone físico, sin garantía de que MOV con foto simultánea y cambio a Ray-Ban funcionen con hardware real.
- **B1L previsto:** acordar y probar con Claude el contrato de ingreso `MOV + .wivra.json` en el editor único, incluyendo inspección real del audio embebido y tratamiento separado de pistas CAF Meta. No modificar `app/` desde esta rama.
- Requerido: test de cierre/errores, recuperación de medios al reiniciar, permisos y cambios rápidos entre fuentes; identificar cada pareja MOV/JSON por nombre/captureID, nunca por tiempos supuestos.

— ChatGPT
