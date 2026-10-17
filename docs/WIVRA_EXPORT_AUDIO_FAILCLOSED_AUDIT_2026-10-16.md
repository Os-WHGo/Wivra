# Wivra export audio fail-closed · auditoría 16-10-2026

## Evidencia del cambio
Rama: `chatgpt/wivra-export-audio-failclosed-20261016`, basada en `chatgpt/wivra-unified-owner-20261016` (PR #131). No se tocó `main`.

### Riesgo P1 corregido
`app/export.mjs` podía producir video silencioso cuando fallaba la inicialización de AudioContext o la decodificación de pistas independientes, y solo devolvía `hasAudio`/`skippedAudio` tras grabar. El exportador ahora:
- Verifica originales de video/foto, overlays y pistas de audio activas antes de preparar la grabación.
- Cancela antes de grabar si falta AudioContext para contenido audible.
- Cancela si falla inicialización o decodificación de una pista, liberando tracks de canvas, elemento de video y AudioContext.
- Permite exportar intencionalmente sin audio si las pistas se silencian.
- Añade regresiones en `app/tests/export-audio-preflight.test.mjs`.

### Pruebas realizadas en esta ejecución
- Análisis sintáctico de `app/export.mjs` completo en motor JavaScript: PASS.
- Nueve verificaciones de preflight con funciones reales del archivo: 9/9 PASS.
- Dos invocaciones virtuales de `recordProject` (archivo original ausente y motor de audio ausente): 2/2 rechazos esperados.
- La rama de este cambio aún no tiene runs de Actions ni build validado: **no se declara CI verde para esta rama**.
- La rama base `chatgpt/wivra-unified-owner-20261016` en SHA `ad61cde9420ce93135d54c05fae8bd16b2a6e741` tiene nueve workflows de CI correctos, incluida beta móvil. Esta evidencia es solo del **padre**, no de la corrección.

### Pendiente
- CI integral y builds sobre el SHA exacto de esta rama.
- QA real iOS/Android de codecs, audio y sincronía.
- PR draft: el conector rechazó la creación durante esta ejecución.
- Persisten riesgos de recursos ante fallos de overlays y MediaRecorder previos al bloque `finally`; requieren revisión adicional.
