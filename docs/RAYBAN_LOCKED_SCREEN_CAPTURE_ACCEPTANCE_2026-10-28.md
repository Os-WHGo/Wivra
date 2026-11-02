# Wivra · Ray-Ban Meta con teléfono bloqueado · contrato P0
Fecha: 2026-10-28. Estado: **requisito definido; NO verificado en hardware**.

## Objetivo de producto
Conectar gafas Ray-Ban Meta Gen 2 a Wivra, iniciar grabación, bloquear iPhone/Android y guardar el teléfono en el bolsillo. La captura debe continuar y producir un archivo local recuperable sin obligar a mantener la pantalla encendida. **No afirmar que esto funciona hasta probarlo en cada plataforma.**

## Diferenciar tres rutas
1. Captura DAT/streaming de las gafas hacia Wivra con pantalla bloqueada: objetivo P0, condicionado por API, permisos, políticas de background y comportamiento del SO.
2. Grabación interna autónoma de las gafas: flujo separado; no asumir que Wivra recibe ni puede controlar el archivo durante el bloqueo.
3. Cámara propia del teléfono bloqueado: requisito distinto; no usar su viabilidad como prueba de (1).

## Contrato mínimo de sesión
- Estados: idle → connecting → recording → interrupted/reconnecting → stopping → finalized; error recuperable.
- Un identificador de sesión y manifest local con tiempos, origen (Ray-Ban), perfil de audio, segmentos confirmados, interrupciones y resultado.
- Escritura incremental en fragmentos con cierre verificable; nunca presentar un MP4 final como íntegro antes de confirmar su cierre.
- En background no depender de timers JS, WebView visible ni del renderizado de frames; usar la ruta nativa que permita el SDK y el SO.
- Bloqueo de pantalla y retorno a foreground no deben crear una segunda grabación ni sobrescribir fragmentos.
- Ante pérdida Bluetooth/Wi-Fi, batería, suspensión del SO o terminación: registrar el último fragmento confirmado, intentar recuperación cuando esté permitido y avisar al usuario. No prometer reconexión autónoma si el SO impide ejecutar.
- Indicadores/consentimiento de cámara y micrófono; respetar permisos y políticas Apple/Google. No implementar mecanismos para evadir restricciones de privacidad del SO.

## Criterios de aceptación por separado
| Escenario | iOS | Android |
|---|---|---|
| Iniciar con gafas y pantalla activa | PENDIENTE HARDWARE | PENDIENTE HARDWARE |
| Bloquear y mantener 1, 7, 30 y 60 min | PENDIENTE HARDWARE | PENDIENTE HARDWARE |
| Audio y video sincronizados tras desbloquear | PENDIENTE HARDWARE | PENDIENTE HARDWARE |
| Pantalla apagada, teléfono en bolsillo, sin interacción | PENDIENTE HARDWARE | PENDIENTE HARDWARE |
| Interrumpir enlace y recuperar fragmentos locales | PENDIENTE HARDWARE | PENDIENTE HARDWARE |
| Baja batería, llamada entrante y presión térmica | PENDIENTE HARDWARE | PENDIENTE HARDWARE |
| Archivo reproducible y metadatos de discontinuidades | PENDIENTE HARDWARE | PENDIENTE HARDWARE |

## Próxima implementación
Inspeccionar la ruta real del SDK DAT de cada plataforma, sus callbacks de background, sesión nativa y escritor de medios. Integrar un manifest persistente y el ciclo de vida en las clases nativas existentes; evitar declarar soporte sin medirlo. Confirmar en documentación oficial qué capacidades y restricciones aplican a cada versión del SDK y SO.

## Riesgo de entrega
El requisito de grabación continua con pantalla bloqueada es P0 para captura Ray-Ban. Si no es viable en una plataforma, declarar la limitación en la beta y ofrecer solo el flujo técnicamente soportado, sin falsos indicadores de grabación.
