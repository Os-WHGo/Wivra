# Android LIVE · revisión local · 2026-11-10

— Codex

Estado: implementación y pruebas locales en rama; **sin compilación Android ni ejecución instrumentada**. No certifica hardware, RTMPS de proveedor ni recuperación de un MP4 cuyo muxer murió antes de escribir el índice.

## Base y coordinación

- Repositorio: `Os-WHGo/Wivra`.
- Base exacta: PR #220, `af77f1210a8f37d9490e30da93c83cedc70f5595`.
- Rama local: `codex/android-live-stability-20261110`.
- Verificado al inicio y al cierre: #220 sigue en ese HEAD; main sigue en `99732810355970752b385244f327a35bbc787fe5`.
- #221 avanzó durante la sesión desde `6fe13bd4` hasta `f1d9f2db764cf1b5f6ee4bff79c3c534a03eb266`. Sus cuatro commits nuevos afectan exportación y tests de exportación; ningún archivo coincide con este parche. No se incorporaron ni modificaron.
- Sin push, PR nueva, merge, publicación, borrado de ramas ni ejecución/reintento/activación de workflows. Solo se consultaron resultados históricos.

## Fallo y correcciones

El log histórico del job `128600350900`, run `42437806156`, ya contiene `WIVRA-LIVE-PHONE=on air`; después falla `Standby screen`. No es el anterior fallo de preparación de cámara. La causa comprobable en código es `showSources()`: rechazaba todo el menú cuando `initiatedByUser` era verdadero, aunque el test necesita una tarjeta interna durante LIVE. Además, la búsqueda usaba el primer `By.scrollable(true)` indistintamente para ambos ejes, y una escena seleccionada añade `●` a su texto.

1. `WivraLiveScenes.kt`: política pura de acciones. Durante LIVE/reconexión/copia local quedan disponibles espera, posición y sonido del video; los selectores externos y la eliminación de fuentes quedan fuera. Revalidación al pulsar un ítem.
2. `WivraLiveSceneController.kt` + `full/res/values/live_ids.xml`: IDs estables de escenas y ambos contenedores. Se conservan nombre/estado TalkBack, selección y dimensiones adaptables.
3. `WivraPhoneLiveActivity.kt`: Inicio desactivado hasta permiso, superficie válida, preview, pantalla foreground y primera captura completada de Camera2. Errores/desconexión de cámara invalidan readiness; callbacks de red se serializan en UI con lifecycle. Una superficie que reaparece durante emisión/grabación se adjunta sin borrar filtros GL. Botones con mínimo de 48dp tras el estilo compartido.
4. El MP4 se marca en uso antes de `startRecord`. Solo se libera al detener el escritor o liberar el publisher. Un cierre fallido conserva el bloqueo y el archivo; la verificación rechaza archivos activos. RTMP failure/auth/retry no llama a `stopRecord`, crea otro MP4 ni borra el original. El callback tardío de grabación no debe reemplazar el estado conectado.
5. Audio: se conserva opt-in, `NoAudioSource` en preview, elección independiente de entrada y comprobación de dispositivo. Pérdida de una entrada elegida sigue deteniendo y conservando lo grabado. No se cambia la ruta Ray-Ban, sus módulos ni el presupuesto de preview JPEG de #220.

Se reutilizan RootEncoder 2.8.1 y UiAutomator 2.3.0 (Apache-2.0), sin dependencias de aplicación nuevas. Fuente contrastada: tag RootEncoder `2.8.1`, commit `cca548ab7942ab50d34dede272d5da90d46c6b67`, `StreamBase.stopStream/stopPreview`, `RtmpClient.reConnect/disconnect` y `Camera2Source`/`Camera2ApiManager`. `stopStream` conserva fuentes mientras hay grabación; `stopPreview` solo retira el display mientras stream/record siguen activos. Se prefirió corregir esa integración y reutilizar la política existente frente a introducir otro motor/servidor.

## Regresión

- `WivraLiveSourceActionsTest.kt`: acciones antes/durante LIVE, prohibición de selectores externos y recuperación del audio de cámara tras espera.
- `android-live-journey-regressions.test.mjs`: seis contratos de menú, ejes, ciclo de superficie, callbacks, protección MP4 y recorrido integral.
- `WivraPhoneLiveJourneyInstrumentedTest.kt`: conserva cámara → consentimiento → RTMP local → espera → cámara → corte → reconexión → parada → duración MP4. Añade navegación horizontal por IDs, prohibición de pickers durante LIVE y «Después» → reabrir pantalla → recuperar la copia exacta → guardar en Galería.
- `WivraLiveControlsInstrumentedTest.kt`: preparado para validar controles/audio opt-in/escenas en vertical y horizontal sin transmitir ni grabar.
- Contratos existentes ajustados explícitamente, sin eliminar criterios: el bloqueo genérico del menú pasa a exigir bloqueo de acciones externas; el contrato de grabación exige ahora `markWriting` inmediatamente antes de `startRecord`.
- `tools/test-android-live-jvm.sh`: ejecutor local de 14 clases de políticas y utilidades puras, sin stubs Android ni acceso de red.

## Pruebas ejecutadas

| Comando | Resultado |
| --- | --- |
| `node --test streaming/tests/*.test.mjs` | 578 tests: 568 PASS, 0 FAIL, 10 TODO preexistentes |
| `node --test core/tests/*.test.mjs core/*.test.mjs app/tests/*.test.mjs` | 840 PASS, 0 FAIL |
| `tools/test-android-live-jvm.sh` con Kotlin 2.2.20/JUnit 4.13.2/Hamcrest 1.3/JSON 20240303 | 53 PASS, 0 FAIL; bytecode JVM 17, ejecutado en Java 21.0.13 |
| `git diff --check` | PASS |
| `gradle -p streaming/android :app:compileFullDebugKotlin :app:compileFullDebugAndroidTestKotlin :app:testFullDebugUnitTest` | No ejecutable: exit 127, `gradle: command not found` |

Node ejecutado: `v24.22.1`. Kotlin/JUnit se descargaron de fuentes oficiales para compilar únicamente las políticas reales independientes de Android. No se instalaron SDK Android, Gradle, JDK adicional ni infraestructura externa. No hay `gradlew`, Android SDK, `adb`, `sdkmanager` ni emulador configurados en este entorno. Las dos clases instrumentadas están **sin compilar/ejecutar aquí**; los contratos Node no sustituyen esa validación.

Reproducción JVM (rutas absolutas a dependencias locales):

```bash
KOTLINC=/ruta/kotlinc/bin/kotlinc \
JUNIT_JAR=/ruta/junit-4.13.2.jar \
HAMCREST_JAR=/ruta/hamcrest-core-1.3.jar \
JSON_JAR=/ruta/json-20240303.jar \
tools/test-android-live-jvm.sh
```

## Pendiente y entrega sin consumo de Actions

1. Compilar FULL y su test APK en una máquina local con SDK 36 y Gradle 8.13. No atribuir a este SHA la compilación verde histórica de #220.
2. Ejecutar localmente ambas clases instrumentadas y el servidor existente `tools/rtmp-cut-server.cjs`; verificar imagen de espera, reconexión, MP4 con cuadros antes/después del corte y recuperación tras reabrir. Ejecutar también denegación de cámara y pérdida de la entrada de audio elegida.
3. Validar físicamente micrófono automático/USB/Bluetooth, audio real y duración/seek/sincronía del MP4, almacenamiento bajo y cierre inesperado. Un archivo incompleto se conserva y debe seguir etiquetado no verificado; este cambio no introduce reparación de índices MP4 ni garantía de recuperación tras muerte del proceso.
4. Revisión e integración posteriores con #221 por separado; no se fusionó main.

Los workflows contienen disparadores `pull_request` por rutas Android/streaming y algunos `push` limitados a ramas anteriores. Abrir o sincronizar una PR puede consumir Actions. Se prepara un commit local identificado con autoría Codex con `[skip ci]` como defensa adicional; **la garantía de cero activación en esta entrega es no subir ni abrir PR**. No se modifican workflows ni se desactivan checks para ahorrar. Antes de cualquier subida futura, revisar de nuevo triggers y política de omisión para todos los eventos; no usar etiquetas de empaquetado ni `workflow_dispatch`.
