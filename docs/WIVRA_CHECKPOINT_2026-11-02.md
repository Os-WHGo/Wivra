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
