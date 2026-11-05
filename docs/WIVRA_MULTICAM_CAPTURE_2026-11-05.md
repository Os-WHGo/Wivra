# Wivra · Multicámara y captura avanzada (Claude, 05-11-2026)

Rama `claude/wivra-multicam-capture-20261105`, basada en la cabeza de #167 (`9482102`, con el CI 4/4 en verde al empezar). PR en borrador #169. No toca la exportación acelerada (Codex) ni LIVE (ChatGPT).

**Nada de esto se ha probado en un teléfono físico.** Las pruebas de Linux y del CI comprueban la lógica, los contratos del código y la compilación, pero no demuestran que un teléfono grabe con dos cámaras.

## 1. Qué había antes (auditoría)

| Pieza | Estado previo | Dueño |
|---|---|---|
| `core/source-capabilities.mjs` | Contrato de fuentes basado en evidencia (`concurrentVideo`, `validateMultiSourcePlan`) | ChatGPT |
| Android `WivraPhoneCameraActivity` | CameraX con una sola cámara (trasera o frontal), micrófono en el MP4 o WAV aparte | ChatGPT |
| Android, selector de fuentes | Ray-Ban (DAT) o cámara del teléfono; LIVE de cámara o de pantalla | ChatGPT |
| Android, pantalla | `MediaProjection` con consentimiento del sistema en cada sesión, token de un solo uso y servicio `mediaProjection` (solo en la edición full) | ChatGPT |
| iOS `WivraIPhoneCamera` | Una sola `AVCaptureSession` con lista de lentes | ChatGPT |
| iOS, pantalla | No hay ReplayKit | — |
| Editor | Capas de video superpuestas (`add_overlay_clip`: x, y, escala, forma) | Claude/editor |

Lo que faltaba: detectar pares de cámaras simultáneas, grabar con dos cámaras, el PiP como resultado de la grabación, la recuperación cuando se pierde una cámara y la alternativa a una sola cámara.

## 2. Qué se añadió

### Núcleo común (`core/multicam-plan.mjs`)
- `normalizeCameraInventory`: solo el inventario que informa el teléfono en ejecución (`provenance: 'runtime'`) puede habilitar dos cámaras. Un catálogo o un fixture nunca lo hace.
- `planCameraCapture`:
  - Android con un par simultáneo → `dual-composited` (CameraX compone un solo MP4).
  - iOS con MultiCam → `dual-separate` (dos archivos que luego une el editor).
  - En cualquier otro caso → `single`, con el motivo.
- `pipLayout`, `toCameraXComposition` y `toEditorOverlay`: la misma geometría del recuadro en JS, Kotlin y Swift (las tres pruebas usan los mismos números).
- `applyPipComposition`: video principal + recuadro con las operaciones atómicas del editor. Usa el desfase medido entre las dos cámaras y deja sonar una sola fuente de audio.
- `multicamReduce`: máquina de recuperación.
  - Si se pierde una cámara mientras graba, cierra la toma, conserva los bytes y sigue en una toma nueva con la otra cámara.
  - Si se pierde la última cámara, se detiene sin borrar nada.
  - Si una cámara vuelve, no corta la toma en curso.
- `planPhoneWithWearable`: teléfono + gafas solo con evidencia de ejecución de fotogramas simultáneos (contrato de ChatGPT). Si no la hay, graba solo con el teléfono.
- `screenCaptureGate`: la captura de pantalla exige el consentimiento del sistema en esta misma sesión. En iOS la grabación de pantalla no se ofrece porque no hay ReplayKit.

### Android
- `WivraDualCameraActivity` usa las cámaras simultáneas de CameraX 1.5.3 con `CompositionSettings` y graba un solo MP4 con recuadro.
  - Solo enlaza un par trasera + frontal que informe el teléfono (`availableConcurrentCameraInfos`).
  - Si no hay par, o si falla la apertura, graba con una cámara y lo dice.
  - Vigila `cameraState` y, ante un error crítico o un cierre, aplica la recuperación descrita arriba.
  - Verifica las tomas con el `WivraCaptureMediaVerifier` existente.
  - Las tomas quedan privadas en la misma carpeta pendiente que la cámara del teléfono hasta que el usuario las guarda.
- `WivraMulticamPolicy` (Kotlin puro) tiene prueba JVM. Hay una opción nueva en el selector de cámara y textos en 8 idiomas.

### iOS
- `WivraMultiCamCapture` graba la trasera y la frontal en una `AVCaptureMultiCamSession`, en dos `.mov`.
  - El micrófono va solo al video principal.
  - Escribe un recibo `.multicam.json` con el desfase de inicio, medido con las devoluciones de `didStartRecording`: es aproximado, no exacto al fotograma.
  - Comprueba `hardwareCost` y `systemPressureCost`; si alguno pasa de 1, graba con una sola cámara.
  - Ante presión del sistema o un error de ejecución, cierra los archivos y sigue en una toma nueva con una cámara. Una llamada o pasar a segundo plano detienen la grabación limpiamente.
- `WivraMultiCamScreen` se abre desde la pestaña iPhone solo cuando esa cámara ya liberó AVFoundation.
- `WivraMultiCamPolicy` (solo Foundation) tiene una prueba de humo con Swift 6 en macOS dentro del CI.

## 3. Diferencias entre Android e iOS

| Tema | Android | iOS |
|---|---|---|
| Detección | `CameraManager.getConcurrentCameraIds` y `availableConcurrentCameraInfos` | `AVCaptureMultiCamSession.isMultiCamSupported` y `supportedMultiCamDeviceSets` |
| Resultado | 1 MP4 ya compuesto (PiP fijo) | 2 MOV + recibo (el PiP se puede editar después) |
| Mover el recuadro | Antes de grabar (se vuelve a enlazar) | En el editor |
| Audio | Micrófono en el MP4 o silencio | Micrófono solo en el video principal |
| Pérdida de cámara | `CameraState` con error crítico o cierre | Notificaciones de interrupción y de error de ejecución |
| Pantalla | `MediaProjection` con consentimiento por sesión (LIVE, ChatGPT) | No implementada |

## 4. Teléfono + Ray-Ban Meta a la vez (diseño, sin implementar)

- Fuentes: CameraX o AVFoundation para el teléfono y DAT (`mwdat-camera`) para las gafas. Cada una graba su propio archivo, con su verificador y su recibo de toma.
- Reloj común: el instante de inicio de cada toma en el reloj monotónico del sistema (`elapsedRealtimeNanos` / `CACurrentMediaTime`). El editor coloca las gafas como recuadro con `applyPipComposition` usando ese desfase.
- Puerta: `planPhoneWithWearable`, que solo permite la grabación doble con evidencia `concurrentVideo` de las dos fuentes en la misma sesión, más la validación del compositor. Si no la hay, graba solo con el teléfono.
- Riesgos sin medir: ancho de banda Bluetooth/Wi-Fi de las gafas con la cámara del teléfono activa, temperatura, la gestión de la cámara por parte de la app de Meta y el audio (se elige uno solo, nunca dos micrófonos mezclados).
- Requisito: una prueba física con unas gafas Gen 2 registradas en DAT. No se afirma compatibilidad.

## 5. Pruebas

| Prueba | Resultado | Tipo |
|---|---|---|
| `core/tests/multicam-plan.test.mjs` | 11/11 (core completo 114/114) | Lógica, Linux |
| `WivraMulticamPolicyTest` (JVM) | 3/3 en local | Lógica, JVM |
| `streaming/tests/android-dual-camera.test.mjs`, `ios-multicam.test.mjs` | 5/5 y 5/5 (streaming 425/425) | Contrato de código |
| Compilación Android/iOS y prueba de humo Swift en macOS | CI del PR #169 | Compilación |
| Teléfono físico | **Pendiente** | Físico |

## 6. Pasos para la prueba física (propietario)

Android (APK de prueba, solo si el propietario autoriza el hito):
1. Abre Wivra → Cámara → «Dos cámaras a la vez (recuadro)».
2. Mira el mensaje. Si dice «Dos cámaras activas», graba 30 s. Si dice que el teléfono no lo informa, anota el modelo.
3. Toca «Cámaras del teléfono» y haz una captura de pantalla de la lista.
4. Graba 1 min y, mientras graba, abre la cámara en otra app (para provocar una pérdida). Anota si Wivra sigue grabando con una cámara.
5. Abre «Tomas» → «Guardar en la galería» y reproduce el video en Galería: comprueba el recuadro, el audio y la duración.

iPhone:
1. Pestaña iPhone → «Dos cámaras a la vez (recuadro)» → Grabar 30 s.
2. En Capturas deben aparecer dos MOV y un `.multicam.json`.
3. Graba 5 min y anota la temperatura y si aparece «presión del sistema».

## 7. Pendiente

- Importar en el editor el par de iOS y aplicar `applyPipComposition` automáticamente al abrir el recibo (hoy se hace a mano con la capa superpuesta).
- Confirmar en un teléfono el sentido del eje Y de `CompositionSettings` (la documentación de CameraX se contradice). El botón «Mover recuadro» recorre las 4 esquinas, así que un signo invertido no bloquea la grabación.
- Grabación de pantalla local en Android (hoy solo existe la de LIVE) y ReplayKit en iOS: requieren decisión del propietario.
- Teléfono + Ray-Ban: implementación tras una prueba de evidencia `concurrentVideo` con gafas reales.

— Claude
