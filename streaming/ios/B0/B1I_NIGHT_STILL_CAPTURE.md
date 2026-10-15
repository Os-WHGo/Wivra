# Wivra B1I · foto nocturna de obturación lenta (experimental)

**Rama:** `chatgpt/iphone-b1i-night-photo-20261015`, apilada sobre PR #61. Código de cámara nativa del iPhone, sin cambios en Editor de Claude, LIVE o gafas DAT. No fusionar a `main`.

## Implementado

- Control **Foto nocturna · solo fotografía** dentro de **Pro**, habilitado únicamente cuando el formato activo y la lente exponen duración manual de al menos **1/8 s**.
- Máximo determinado en tiempo de ejecución por `AVCaptureDevice.activeFormat.maxExposureDuration`, con techo de prototipo de **8 segundos**. No se inventa soporte donde el formato no lo ofrece.
- `AVCapturePhotoOutput` obtiene JPEG original con la exposición solicitada al sensor mediante `setExposureModeCustom`. No es un filtro de brillo. El original permanece intacto; los looks generan copias.
- MOV se deshabilita durante Foto nocturna. Salir restaura la obturación de video (máximo **1/30 s**). Tomar fotos normales durante MOV sigue siendo posible, sujeto a pruebas físicas.
- La UI explica límites del sensor, requisito práctico de trípode y ausencia de Night mode computacional, RAW/ProRAW, apilado estelar y LIVE.

## No confirmado

La exposición final real en metadatos EXIF, calidad, latencia, fallos de captura, controles manuales simultáneos, temperatura y continuidad MOV+JPEG siguen pendientes de **iPhone físico**. Un formato puede reportar una duración que luego no entregue fotos utilizables. No se ha implementado astrofotografía real ni bracketing/stacking.

La exclusión mutua entre finalización asíncrona de una sesión Meta y el inicio de la cámara iPhone todavía requiere auditoría y pruebas. Tampoco se integró selector de micrófonos externos, pistas CAF separadas ni manifiesto `.wivra.json` de la cámara iPhone.

## Aceptación en hardware

1. Detectar formatos y límites de lente real; probar control con y sin capacidad de larga exposición.
2. Con trípode, tomar fotos Auto vs Pro nocturna a distintas duraciones y comprobar EXIF, exposición efectiva, ruido y que cada JPEG siga existiendo al salir.
3. Verificar que REC no se inicia en Foto nocturna; desactivarlo, grabar MOV 2 min y tomar 5 fotos durante video, comprobando continuidad y audio.
4. Probar cámara trasera/frontal, permisos, segundo plano, almacenamiento y sobrecalentamiento; cambiar a Ray-Ban y comprobar que no se solapen sesiones.

**Pruebas automáticas:** `streaming/tests/meta-b1i-night-photo-source.test.mjs` comprueba solo contratos del código; Xcode compila mediante workflow nativo. CI verde no significa prueba en dispositivo.

**Siguiente bloque:** arbitraje real Meta↔iPhone y manifiesto de captura hacia el editor único; después selector de micrófono y pista independiente.
