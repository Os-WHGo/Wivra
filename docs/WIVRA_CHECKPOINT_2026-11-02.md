# Wivra | Checkpoint de software (corte 02-11-2026)

> Registro operativo en GitHub para dar continuidad al checkpoint canónico MU mientras no está disponible el conector de Google Docs. No sustituye ni modifica el documento privado ni los registros MU.

## Estado Git y coordinación

- Repositorio: https://github.com/Os-WHGo/Wivra
- Rama activa: `chatgpt/wivra-p0-w29-mobile-export-storage-20261102`
- HEAD al corte: `95a6671f46b24431e33164ae604010e1261b0321`
- PR: [#164](https://github.com/Os-WHGo/Wivra/pull/164), abierto, draft.
- Base `main`: `99732810355970752b385244f327a35bbc787fe5`; sin cambios desde este macrobloque.
- Política: no merge a main, no publicación, no ramas eliminadas, no APK/IPA ni instalables en este corte.
- Conservar el editor único, Director, timeline, captura y aportaciones históricas. No duplicar ni reemplazar el motor estable.

## Macrobloques y evidencia verificada

### W39-W42: resistencia y continuidad audiovisual
- Ensayos sintéticos Linux/Chromium con Mediabunny 1.61.6: 10, 20, 30 y 60 minutos.
- Soak CI [41547473701](https://github.com/Os-WHGo/Wivra/actions/runs/41547473701): los cuatro jobs de duración finalizaron en success; el auditor agregado también finalizó success.
- Incluye pista musical continua y bloques de voz independientes; se inspecciona audio al inicio, mitad y final.
- Evidencia no equivale a pruebas de batería, temperatura, memoria real en iPhone/Android ni medios Ray-Ban.

### W43: integridad del bundle offline
- Commit `95a6671f46b24431e33164ae604010e1261b0321`.
- Verificación SHA-256 del bundle exacto, fail-closed ante digest ausente, inválido o distinto.
- Tests unitarios de integridad incluidos en App Tests.

### Resultado CI del HEAD W43
- 10 de 11 workflows terminaron success; 1 falló: matriz aislada WebCodecs [41547473657](https://github.com/Os-WHGo/Wivra/actions/runs/41547473657).
- Causa confirmada en log: el workflow no exportó `WIVRA_MEDIABUNNY_SHA256`; el build QA detuvo correctamente la incorporación del bundle. Las pruebas posteriores de esa matriz quedaron skipped por dependencia.
- Soak de 60 minutos y auditor agregado terminaron success.
- Android Native Build, iOS Native Build, App Tests, Director/Editor, LIVE Preflight y contratos de Beta Assembly terminaron success. Los jobs nativos compilan código fuente; no produjeron instalables.

## Corrección inmediata en curso

- W43.1: workflow descarga el tarball oficial Mediabunny 1.61.6, valida su SHA-512/SRI publicado por npm, instala el archivo verificado y suministra SHA-256 del bundle instalado al build QA.
- Se mantiene el motor MediaRecorder como default y el acelerador fuera del paquete beta estándar.
- Pendiente: CI nuevo del commit correctivo; no declarar cerrado hasta que la matriz aislada pase completa.

## Siguiente trabajo exacto

1. Confirmar W43.1 en CI: matriz Chromium/WebKit, smoke offline, MediaRecorder/WebCodecs, ffprobe, multipista y auditor.
2. Continuar W44: auditoría y endurecimiento de los escritores nativos Android/iOS para escrituras fuera de rango, solapamientos, duplicados, huecos, cobertura final y truncado seguro.
3. Repetir compilaciones nativas si W44 modifica fuentes Kotlin/Swift. No generar APK/IPA sin hito autorizado.
4. Después validar contenedor MP4 H.264/AAC y fallback real; mantener las pruebas físicas agrupadas para iPhone, Android, Ray-Ban, micrófonos y LIVE.
5. Actualizar el checkpoint de Google Docs y la biblioteca tecnológica MU cuando el conector vuelva a estar disponible.

## Bloqueos y límites

- No se ha demostrado todavía exportación física prolongada iPhone/Android.
- Ray-Ban Meta HEVC y sincronía de audio externa siguen pendientes de dispositivo real.
- LIVE RTMP real e iOS LIVE no se dan por verificados por pruebas Linux.
- WebCodecs + Mediabunny sigue en QA, no activado automáticamente.


---

## Continuidad GitHub | corte 03-11-2026

> Actualización operativa. Google Drive continúa fuera del circuito de escritura; este checkpoint temporal se mantiene en la rama de trabajo de GitHub y no reemplaza los documentos privados MU.

### Estado Git confirmado
- Rama: `chatgpt/wivra-p0-w29-mobile-export-storage-20261102`
- HEAD al corte: `28e9ed3ff2fdca05ea7ab0a4913e0af5b6a57a83`
- PR: [#164](https://github.com/Os-WHGo/Wivra/pull/164), abierta y en draft.
- Base `main`: `99732810355970752b385244f327a35bbc787fe5`.
- Comparación: 61 commits ahead, 0 behind. No se modificó `main`.
- No APK, IPA, publicación, firma, instalable ni prueba física declarada.

### W44-W46 | escritores nativos y seguridad del protocolo v2
- Android e iOS conservan sus escritores v2 de acceso aleatorio separados del MediaRecorder v1.
- Las reservas de almacenamiento de Android/iOS se aplican a los límites efectivos del escritor; se rechazan escrituras fuera de reserva, solapamientos no permitidos, huecos, totales inconsistentes y archivos alterados.
- W29 protege la reserva nativa derivada del bitrate progresivo, añade 15% más 16 MiB y conserva el límite QA móvil de 180 s.
- Se endureció el parseo numérico del puente Android: enteros JSON exactos y dentro de rango; no admite decimales, cadenas, booleanos ni valores no finitos como números.
- Se endureció el parseo del puente iOS con distinción CFBoolean/NSNumber, rechazo de flotantes y validación exacta de enteros para versión, secuencia, posición, bytes, duración y reserva.
- Android añade limpieza de filas MediaStore pendientes de una publicación v2 interrumpida. La eliminación exige coincidencia de estado pendiente, propietario de la app, carpeta Movies/Wivra, patrón de nombre generado y MIME. El DELETE repite esas condiciones. Conserva filas publicadas, otros propietarios y contenido ajeno.
- Pruebas JVM añadidas para el parser JSON y el predicado de filas pendientes; smoke Swift macOS amplía las pruebas de tipos JSON y conserva el ciclo de escritura/recovery con MP4 H.264/AAC real.
- Cambios de seguridad registrados en los commits `7ad5959`, `33b4fd0`, `c84cdb0`, `e023c17`, `d4d20d3`, `3a83333`, `29b7cc0`, `28e9ed3`.

### CI del HEAD 28e9ed3
Aprobados:
- App Tests [41595900123](https://github.com/Os-WHGo/Wivra/actions/runs/41595900123).
- Android Native Build [41595899911](https://github.com/Os-WHGo/Wivra/actions/runs/41595899911): compila Android FULL y Capture, tests unitarios nativos y comprobación de recursos; job final `success`. Sin APK.
- Director/Editor [41595899914](https://github.com/Os-WHGo/Wivra/actions/runs/41595899914).
- Creative Director [41595899888](https://github.com/Os-WHGo/Wivra/actions/runs/41595899888).
- LIVE Preflight [41595900272](https://github.com/Os-WHGo/Wivra/actions/runs/41595900272).
- Local Visual Evidence [41595900048](https://github.com/Os-WHGo/Wivra/actions/runs/41595900048).
- Chat-First UI [41595899938](https://github.com/Os-WHGo/Wivra/actions/runs/41595899938).
- Beta Assembly [41595899862](https://github.com/Os-WHGo/Wivra/actions/runs/41595899862): contratos de Editor/Director/native success; jobs APK, IPA y emulador omitidos por gates autorizados.

En curso al corte:
- iOS Native Build [41595900004](https://github.com/Os-WHGo/Wivra/actions/runs/41595900004): smoke macOS de recuperación acelerada H.264/AAC y parser JSON success; Simulator compile success; generic iPhone arm64 compile todavía en ejecución. No firma ni IPA.
- WebCodecs browser matrix [41595899901](https://github.com/Os-WHGo/Wivra/actions/runs/41595899901): Mediabunny 1.61.6 offline, build QA, canvas, ffprobe y 81 cortes completados; pasos restantes de exportación progresiva, multipista, continuidad, 180 s, 720p y audio.
- Accelerated long-form soak [41595900126](https://github.com/Os-WHGo/Wivra/actions/runs/41595900126): jobs de 10/20/30/60 min iniciados; los renders y validaciones finales siguen en ejecución. No se declaran aprobados hasta cierre del workflow.

### Límites y próxima acción
- WebCodecs + Mediabunny continúa aprobado y con renderer multipista y hosts nativos implementados; permanece aislado de la selección automática del exportador mientras no cierren las comprobaciones pendientes.
- MediaRecorder continúa siendo el fallback estable.
- Los soaks Linux/Chromium no equivalen a prueba física en iPhone/Android, prueba de temperatura/memoria del teléfono, Ray-Ban HEVC o LIVE RTMP.
- Próximo paso exacto: cerrar el CI iOS arm64, browser matrix y soak; corregir cualquier fallo en esta misma rama; después completar una prueba instrumentada Android MediaStore y preparar el siguiente lote agrupado de pruebas en iPhone/Android físicos. No fusionar PR #164 hasta superar sus gates y autorización de fusión.
