# Wivra LIVE B2B: laboratorio nativo de escenas iPhone

ESTADO: Código SwiftUI de PREVIEW/PROGRAMA LOCAL, sin RTMP, encoder ni composición grabada. Basado en la rama B2 (PR #55). No probado con gafas ni iPhone físico.

## Código desarrollado
- streaming/ios/B0/Sources/WivraLiveNativeSceneLab.swift: sheet accesible desde MetaB0Screen por botón B2B Abrir laboratorio LIVE.
- Tres presets: news (CG prueba sin cámara), walk (DAT RAW cámara), walk-title (DAT RAW + CG original).
- La fuente de cámara solo se muestra si model.hasPreview, !model.receiveCompressedHEVC y model.previewImage != nil. Permisos/cámara los maneja exclusivamente B0.
- Botones PREPARAR y PASAR A PROGRAMA: validan cámara al preparar y antes del cambio real. El deck de atajos solo prepara, no provoca publicación.
- Registro de cambios scene-preview / scene-take con uptime en ms y export voluntario de JSON wivra-live-edit-log-v1 con mediaRecorded:false y encoderValidated:false.
- streaming/live/b2b-native-lab-fixtures.json contiene 3 escenas del esquema JS B2; streaming/tests/live-b2b-native-lab-source.test.mjs comprueba IDs y puertas de cámara.

## Limitaciones expresas
- PROGRAMA LOCAL es una vista dentro de la app, no salida AV a internet ni composición MOV final. El rótulo de prueba no contiene estados falsos «en directo».
- RAW permite UIImage para mostrar preview. Grabación .hvc1 actual NO tiene decoder visual en este panel; NO hay RAW + HEVC simultáneo asumido.
- Sin reproducción real de memes/clip insertado, sin audio mix, sin codificación H.264/AAC, sin RTMP(S), sin multistream y sin biblioteca descargable implementada.
- El cue sheet no está unido todavía a un proyecto editado ni a reloj PTS de media; es registro de controles de ensayo.
- Si previewImage queda retenida aunque el stream se detenga, requiere vigilancia de frescura del frame. El gating actual depende de estado RAW de B0 y presencia de UIImage.

## Prueba de aceptación
1. Compilar por XcodeGen y Xcode iOS Simulator/ dispositivo ARM64 sin firma; no dar por válido hasta obtener build real de la rama.
2. Sin gafas: abrir laboratorio; escena CG debe permitirse. PREPARAR cambia solo vista Preview; TAKE pasa a Programa; log indica NO grabación.
3. Sin cámara: los botones POV y POV+CG deben estar deshabilitados; intento inválido nunca debe cambiar programa.
4. Con gafas físicas y permiso DAT RAW, verificar fotogramas frescos de Ray-Ban en escena POV, título overlay visible sin bloquear controles.
5. Detener cámara entre preparar y Take: prohibir Take y mostrar error; no congelar fotograma como si siguiera vivo.
6. Exportar JSON cue sheet: campos schema/sceneId/atMs/sequence y false flags correctos. No subida por defecto.
7. Comparar fps y batería con lab abierto y cerrado; revisar VoiceOver, safe areas y UI en iPhone pequeño.

## B2C siguiente
Conectar un adaptador de frame timing real y watchdog; AssetManager local y bibliotecas compartidas; compositor Metal/AVFoundation con CG 2D y layouts PiP; mezcla de audio; encoder/publisher RTMP(S) verificado y opcional grabación. Hardware/streaming se validan en dispositivo real antes de anunciarse.

Roles: ChatGPT captura/LIVE, Claude Editor, Meta AI hardware solo Google Drive. No merge en main sin aprobación.