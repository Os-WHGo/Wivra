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


---

## Continuidad GitHub | corte 03-11-2026

### Estado Git y PR
- Rama de trabajo: `chatgpt/wivra-p0-w29-mobile-export-storage-20261102`
- HEAD de código validado en este corte: `e4d0ea392401cafd7dd8ec2c215bdbccd643424c`
- PR #164: abierta, draft, sin merge: https://github.com/Os-WHGo/Wivra/pull/164
- Base main: `99732810355970752b385244f327a35bbc787fe5`
- Comparación antes de actualizar este checkpoint: 65 commits ahead, 0 behind.
- `main` no se modificó.

### W47 | recuperación de exportaciones aceleradas Android en MediaStore
- Se amplió el test instrumentado existente `WivraExportStoreTest.kt`; no se creó una suite duplicada.
- Nuevo escenario de interrupción: inserta filas sintéticas pendientes MP4 y WebM con propietario, carpeta y patrón v2 propios; ejecuta `WivraRandomExportStore.cleanupOrphanPartials(context)` y comprueba su eliminación.
- El mismo escenario confirma que sobreviven un vídeo publicado, una fila de captura telefónica heredada, un nombre v2 malformado y un archivo pendiente en otra carpeta.
- Nuevo ciclo de vida: comprueba que un archivo privado `.partial` no desaparece mientras exista un escritor activo y que se limpia después de cerrar/abortar ese escritor.
- Son datos multimedia sintéticos: no se toca vídeo personal ni cámara, y no constituye prueba de Ray-Ban, micrófono o LIVE.
- El emulador API 35 existente ya ejecuta `WivraExportStoreTest`. Se conserva exactamente su compuerta `needs: android-beta`; no se añadió un atajo para generar APK.
- `unified-android-build.yml` ahora compila las fuentes androidTest FULL y Capture con `compileFullDebugAndroidTestKotlin`, `compileCaptureDebugAndroidTestKotlin` y sus tareas Java. Estas tareas no ensamblan APK ni arrancan emulador.
- `android-capture-editor-bundle.test.mjs` protege el vínculo entre pruebas, compilación sin instalables y ejecución API 35 bajo el gate de beta.

### CI verificado sobre HEAD de código `e4d0ea3`
Aprobados:
- Android Native Build [41598329244](https://github.com/Os-WHGo/Wivra/actions/runs/41598329244): job completo `success`, 29 pasos. FULL/Capture compile, tests JVM, compilación de las fuentes androidTest FULL/Capture y validación de recursos aprobados.
- App Tests [41598329307](https://github.com/Os-WHGo/Wivra/actions/runs/41598329307): `success`.
- Beta Assembly [41598329273](https://github.com/Os-WHGo/Wivra/actions/runs/41598329273): contrato Editor/Director/native `success`; APK, IPA y Android emulator `skipped` por gates.
- Director/Editor [41598329343](https://github.com/Os-WHGo/Wivra/actions/runs/41598329343): `success`.
- AI Chat-First [41598329322](https://github.com/Os-WHGo/Wivra/actions/runs/41598329322): `success`.
- Creative Director [41598329261](https://github.com/Os-WHGo/Wivra/actions/runs/41598329261): `success`.
- Local Visual Evidence [41598329308](https://github.com/Os-WHGo/Wivra/actions/runs/41598329308): `success`.
- LIVE Preflight [41598329310](https://github.com/Os-WHGo/Wivra/actions/runs/41598329310): `success`.

En curso al corte:
- iOS Native Build [41598329229](https://github.com/Os-WHGo/Wivra/actions/runs/41598329229): pendiente de cierre.
- Browser matrix [41598329243](https://github.com/Os-WHGo/Wivra/actions/runs/41598329243): en cola/pendiente de ejecución.
- Long-form soak [41598329276](https://github.com/Os-WHGo/Wivra/actions/runs/41598329276): 10 min `success`; 20, 30 y 60 min aún en ejecución al corte. No declarar el conjunto aprobado hasta terminar.

### Lo que NO se ha ejecutado ni certificado
- La prueba instrumentada de `MediaStore` real no se ejecutó en el emulador en este corte: el job Android emulator fue omitido porque no se otorgó la etiqueta `wivra-package-beta` ni se lanzó un workflow_dispatch de instalación.
- La compilación de clases instrumentadas no significa que la prueba API 35 haya corrido.
- No se generó APK, IPA, instalable, firma ni artefacto de instalación.
- No hay prueba física nueva de teléfono, Ray-Ban, micrófono USB/Bluetooth o RTMP.

### Siguiente trabajo exacto
1. Cerrar el CI iOS, browser matrix y soaks del HEAD actual, sin confundir Linux/Chromium con QA física.
2. En el hito de beta autorizado, ejecutar el job Android API 35 que ya incluye los escenarios nuevos; revisar logs y filas residuales antes de dar por validada la recuperación.
3. Si el emulador descubre diferencias de MediaStore entre versiones, corregir y repetir el conjunto instrumentado.
4. Agrupar después las pruebas físicas en Android/iPhone para exportación larga, Fotos/Galería, codecs, cámaras, Ray-Ban, audio externo y LIVE.
5. Mantener `ACCELERATED_EXPORT_IMPLEMENTED=false` hasta completar el renderer multipista, codecs y validación física; MediaRecorder sigue como fallback estable.
6. No fusionar PR #164, no publicar, no producir instalables ni alterar `main` sin pasar gates y autorización.
