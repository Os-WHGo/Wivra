# Wivra · beta P0 · puerta de validación en dispositivos (2026-11-01)

**Estado:** protocolo preparado, **NO prueba física realizada**. No utilizar CI, vistas previas, LED, contador de frames o archivo de tamaño positivo como sustitutos de MP4 reproducible. Objetivo de beta: 2026-11-19. PR de trabajo: #138 sobre base #136; sin merge automático.

## Paquetes reproducibles

- Android: obtener el artefacto `Wivra-BETA-Android-DEBUG-apk` del workflow **Wivra Complete Beta Assembly (Mobile)** y verificar SHA256 con `Wivra-BETA-Android-SHA256` de la **misma ejecución y commit**. APK debug solo para pruebas, no publicación.
- iOS: `Wivra-BETA-iOS-UNSIGNED-ipa` es paquete arm64 **sin firma**. No afirmar que es instalable hasta firmar con credenciales autorizadas; comprobar identificador Meta DAT, Team ID, provisioning, entitlements y permiso de Fotos en la versión firmada. No pagar/contratar/publicar sin permiso.
- Correlacionar siempre SHA del HEAD, run, dispositivo, versión iOS/Android, firmware de gafas y hash de artefacto. No confundir artefactos antiguos con el commit actual.

## Matriz de aceptación (evidencia que debe aportar una prueba real)

| Puerta | Pasos y evidencia mínima | Criterio |
|---|---|---|
| P0-A. Captura iPhone | Conectar Ray-Ban Gen 2, registrar DAT, recibir fotogramas, capturar video, detener, confirmar **Keep**, abrir el MOV desde Archivos/AVPlayer. | Video reproducible, duración/frames plausibles, archivo local conservado. |
| P0-B. Señal caducada iOS | Durante preview interrumpir entrada de fotogramas >4 s sin detener sesión. Comprobar indicadores y botón de iniciar; volver a conectar; repetir con REC en curso. | Inicio/foto se deshabilitan sin muestras frescas; **Detener** sigue disponible durante REC. No asumir que frame recibido equivale a archivo final. |
| P0-C. Fotos iPhone | Confirmar Keep. Pulsar **Guardar video en Fotos**. Aceptar permiso add-only; abrir Fotos y reproducir con audio si fue combinado. Repetir denegando permiso y con MP4/MOV inválido. | Copia solo tras confirmación y video válido; original Wivra conservado; fallo visible sin borrado. |
| P0-D. Audio y mux iPhone | Probar sin audio y con micrófono seleccionado disponible; cambiar ruta durante toma. Comparar CAF independiente, MOV original y MOV combinado; comprobar desfase con aplauso. | No sustituir/reclamar audio de gafas sin prueba; no borrar originales; reportar sincronía medida. |
| P0-E. Bolsillo y bloqueo | Probar pantalla bloqueada con opt-in experimental, medir interrupciones reales de tiempo/frames/video final; repetir sin opt-in. | Marcar **experimental** hasta repetición en hardware. No prometer continuidad garantizada en iOS/Meta DAT. |
| P0-F. Android y fotos | Instalar APK debug autenticado, detectar conexión real, probar timeout de frame, capturar y recuperar, verificar MediaStore y editor sin red. | Emulador y dispositivo físico diferenciados. No inferir soporte de futuras gafas. |
| P0-G. LIVE Android | Usar servidor de prueba privado con RTMPS, consentimiento visible y micrófono opcional; cortar la red y comprobar MP4 local. | Transmisión real y archivo local verificables, sin persistir clave de stream. |
| P0-H. Exportación y montaje largo | Importar 81 segmentos en tres tandas; exportar 10/20/30/60 min con dispositivo monitorizado; comparar duración, tamaño, reproducibilidad, sincronía, temperatura y RAM. | Resultados de Chromium/Linux **no** sustituyen una exportación móvil de 60 min. |
| P1-futuro. Gen 3 / Display / gestos | Identificar capacidades expuestas por SDK/firmware y permisos reales, sin inferir por nombre de producto. | Solo anunciar capacidades físicamente verificadas; P1 no bloquea Gen 2. |

## Registro de una ejecución real

- Fecha, ejecutor, dispositivo, SO y firmware:
- Commit + workflow run + SHA256 paquete:
- Identificador de sesión y permisos otorgados:
- Fuente de cámara y micrófono:
- Duración solicitada vs real, contador de muestras vs muestras escritas:
- Evidencia de contenedor reproducible, capturas locales y Fotos:
- Eventos de pantalla bloqueada, pérdidas de enlace y recuperación:
- Resultado **PASS/FAIL/BLOCKED** por puerta y enlace al reporte/issue:
- Regresiones respecto del build anterior:

## Reglas de seguridad

- Mantener originales, archivos pendientes y audio CAF al fallar fotos, mux, exportación o red.
- No capturar sin permiso ni iniciar LIVE público sin confirmación explícita.
- No introducir dependencias que rompan compilaciones de la beta para experimentos Gen 3/Display.
- Evitar publicar o fusionar hasta autorización y matriz P0 revisada.
