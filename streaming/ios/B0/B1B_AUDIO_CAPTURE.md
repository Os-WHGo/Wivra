# Wivra B1B · audio Ray-Ban y archivos vinculados al mismo proyecto

**Preferencia confirmada del usuario (13-oct-2026):** Ray-Ban Meta (video DAT HEVC), **micrófonos de las Ray-Ban (HFP)**, **pista independiente: sí**, **MOV con audio integrado: sí**. El selector genérico para AirPods, micro USB, sistemas inalámbricos y mezcladoras DJ vendrá después, tras comprobar capacidad y rutas reales, sin crear otro editor.

## Implementación experimental, NO certificada con hardware

**PR #48** sobre B1A #46 y B0 #35, sin fusionar a main. Solo iOS hasta implementar un adaptador Android equivalente.
- El usuario solicita permiso iOS de micrófono y pulsa **Buscar micrófonos Bluetooth HFP**.
- Wivra muestra los nombres reales devueltos por AVAudioSession, sin inventar dispositivos. El usuario selecciona la entrada HFP que sabe que pertenece a sus gafas. El sistema comprueba la ruta realmente activa antes y después de arrancar AVAudioEngine. No cambia automáticamente a micrófono del iPhone.
- Al pulsar Grabar HEVC, DAT recibe video comprimido en el iPhone y un archivo CAF PCM conserva el audio aparte. Un reloj local marca la primera muestra escrita y el primer HEVC keyframe aceptado.
- Al detener y finalizar el MOV original, se intenta combinar ambas pistas mediante AVMutableComposition y AVAssetExportSession. Se guarda otro archivo MOV, **sin borrar los originales**. El desfase inicial calculado es una estimación y **no** sustituye una prueba de sincronización audio-video.
- Se genera archivo de metadatos local `.wivra.json` enlazando nombre de video HEVC, nombre de audio CAF, MOV combinado, nombre de entrada y offset. Es un contrato para que el editor Wivra de Claude los importe después como una sola captura editable; **la indexación automática en el editor aún no existe**.
- Si el usuario apaga el audio, el modo B1A graba solo HEVC. Si falla HFP y el usuario solicitó audio Ray-Ban, se muestra error o se conserva solo el video con advertencia; no se presenta un video sin audio como un éxito completo.

## Límites/riesgos pendientes de probar

- GitHub Actions valida compilación Swift (simulador y generic iPhone ARM64, ambas SIN firma). Nada confirma micrófono de gafas ni videos reales mientras la app no esté instalada en un iPhone físico.
- **HFP puede limitar frecuencia/calidad de audio** y cambiar la ruta de salida. Comprobar simultaneidad de Meta DAT con HFP y efectos en estabilidad de cámara. Un dispositivo Bluetooth genérico puede aparecer en HFP, pero su nombre no prueba que sean las Ray-Ban.
- La callback AVAudioEngine actualmente escribe CAF sin buffer asíncrono: medir pausas y pérdida de muestras antes de producción y trasladar I/O a cola eficiente si hiciera falta.
- Notificación iOS de cambio de ruta intenta detener la captura; comprobar desconexión inesperada y privacidad: no prometer que ninguna muestra podría provenir de otra ruta antes del corte hasta validarlo.
- El offset se calcula con CACurrentMediaTime al primer cuadro/muestra aceptado, no con un reloj físico común distribuido entre dispositivos. Se requiere prueba de palmada/voz y corrección de latencia/deriva, especialmente en clips largos.
- Los originales de audio/video y archivos compartidos son locales. No se suben a servicios de IA/streaming sin consentimiento.
- Video y micrófono pueden detenerse con app en segundo plano. No vender la prueba como grabación ilimitada ni usarla como respaldo de grabaciones irrepetibles.

## Test físico de aceptación B1B

1. Validar B0 (fotogramas) y B1A (MOV reproducible) antes de elegir Ray-Ban HFP.
2. Abrir app instalada y firmada, con gafas conectadas. Pedir permiso audio, buscar, seleccionar por **nombre** los Ray-Ban, comprobar ruta HFP activa.
3. Grabar 20–30 segundos hablando y dando una palmada visible. Comprobar audio CAF de origen, MOV original solo-video, MOV mixto y archivo JSON; reproducir la pista y revisar que no hubo sustitución del micrófono.
4. Comprobar duración, canal, nivel, desfase labial real y si audio permanece en la fuente seleccionada durante cortes breves. Comparar con sonido de ambiente; después ensayar 3, 8 y 15 minutos con control térmico.
5. Importación de grupo de archivos al editor único Wivra, conservar audio independiente y poder silenciarlo, desplazarlo o reemplazarlo sin regrabar video. Coordinación con Claude en PR #44.

## Futuro de audio configurable (no implementado aún)

- Entrada AirPods: HFP, siempre verificación de ruta y calidad de comunicación.
- Micrófono USB-C o interfaz de audio USB: fuentes detectadas por AVAudioSession, priorizando calidad de voz.
- Mesa DJ: mediante interfaz de audio USB compatible, con control de niveles y posible pista estéreo o multicanal cuando el hardware lo admita.
- Captura simultánea de micrófonos múltiples: requiere una capacidad real de audio multicanal o interfaces compatibles. No prometer dos entradas Bluetooth activas a la vez en iOS.
- Guardado por segmentos, reparación de pérdidas, monitoreo de clipping, nivel y sincronía para el LIVE se desarrollarán después.

**Próximo paso exacto:** comprobar la CI, obtener app firmada/instalada en iPhone y ejecutar las pruebas de gafas reales. `main` sin cambios.