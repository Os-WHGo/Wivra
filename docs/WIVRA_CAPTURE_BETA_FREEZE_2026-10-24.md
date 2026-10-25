# Wivra Capture Beta · alcance congelado · 24-10-2026

## Objetivo
Primera beta **instalable en teléfono real** antes del 20-11-2026 para capturar nieve, montaña, POV y narración de Os en Whistler. No esperar al editor completo. Este documento define aceptación, **no certifica implementación**.

## P0 · indispensable para entregar
1. Abrir cámara con permisos explícitos y mensajes de error útiles.
2. Grabar video con audio del micrófono del teléfono; inicio/parada visibles, indicador de grabación, duración.
3. Conservar un archivo reproducible después de detener y verificar su existencia/tamaño antes de confirmar guardado.
4. Guardar localmente y permitir abrir/compartir el archivo desde el teléfono sin depender de nube.
5. Gestionar interrupciones (llamada, segundo plano, pérdida de permisos, espacio insuficiente) sin prometer recuperación imposible.
6. Probar al menos un video corto y uno largo en hardware real, reproducir audio y video fuera de Wivra.
7. Generar un instalador de prueba verificable y registrar dispositivo, OS, formato, resolución, duración y resultado.

## P1 · solo si no retrasa P0
- Cambio frontal/trasera, controles de calidad y selección de micrófono externo cuando el sistema lo permita.
- Foto durante grabación únicamente si el dispositivo y pipeline lo soportan sin corromper el video.
- Guion/pauta ligera visible antes de grabar; no teleprompter avanzado.

## Fuera de esta entrega
- Sincronización automática Drive/iCloud, subida solo Wi-Fi, backup remoto.
- LIVE, Ray-Ban Meta, IA generativa, animaciones, editor completo, publicación a redes.
- No introducir dependencias de pago ni permisos nuevos sin revisión.

## Prueba de aceptación física
- Permitir cámara/micrófono, iniciar, grabar >=30 s, detener, guardar, abrir desde app de archivos/fotos y escuchar audio.
- Repetir con >=10 min, pantalla bloqueada/interrupción controlada según límites del sistema y verificar archivo.
- Verificar almacenamiento bajo, permiso denegado, reinicio de app, archivo incompleto y ausencia de duplicados.
- Repetir por plataforma; Android e iOS no se consideran equivalentes.

## Reglas de entrega
- No tocar main, no force push ni merge automático.
- No confundir compilación de APK/IPA con prueba física.
- El usuario puede editar mientras tanto en una app externa; exportación/compartir original tiene prioridad.
- Seguimiento por evidencia: código, compilación, instalación, grabación, reproducción, guardado.
