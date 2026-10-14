# Wivra B1D · seleccionar la fuente de audio sin modo DJ

**Decisión del propietario (13-oct-2026):** lo importante es poder elegir de dónde se recibe el audio. No requiere festivales, DJ, mixer, streamer ni marketplace. El video puede seguir siendo de las Ray-Ban Meta y el audio llegar desde cualquier **entrada real compatible** del iPhone.

Consultado antes de desarrollar: [Drive Meta AI Specialist](https://drive.google.com/drive/folders/14aI0HdfIk0gZv5AkhjCEOVxpTQdl3iK_) con seis documentos; en particular `AUDIT-PR48-HFP-Simultaneidad.md`, `FINDING-AUDIO-DJI-MULTITRACK-DJ.md`, `PROPOSAL-HandsFree-Voz-Gestos.md`, `FLUJO-Capture-vs-Editor-Material-Vendible.md`. Las propuestas de ventas/tours, cloud-sync automático, comandos y gestos NO constituyen instrucciones del propietario.

## Alcance implementado en esta rama experimental
- La miniapp iOS de B1 detecta fuentes **que devuelve `AVAudioSession.availableInputs`**: micrófono integrado, headset por cable, Bluetooth HFP, audio USB. No asume que DJI, Ray-Ban ni AirPods estén conectados por el nombre de una marca.
- La UI presenta el nombre que informa iOS y una categoría. El usuario elige un UID, toca **Preparar micrófono seleccionado** y Wivra verifica `AVAudioSession.currentRoute`. No hay fallback silencioso de fuente.
- Para modo video HEVC con audio, el prototipo exige **preparar primero la fuente** y después crear la sesión/cámara DAT. Esto evita cambiar de ruta por primera vez en el instante de grabar video. Un flujo que ya tiene una ruta activa no vuelve a configurar la sesión al pulsar Grabar.
- La captura B1B existente sigue creando el sidecar **CAF** de una sola ruta activa y un MOV combinado, ambos experimentales. `WivraCaptureManifest` v2 ahora anota el tipo de fuente elegida (`ios-bluetooth-hfp`, `ios-usb-audio`, `ios-built-in-mic`, `ios-headset-mic`) y el nombre recibido de iOS, no una etiqueta DJI inventada.
- Al cambiar de ruta durante una toma, sigue la política de interrumpir la grabación y avisar, sin grabar desde el micrófono equivocado.

## Qué NO prueba ni implementa
- No son **dos entradas simultáneas**. El audio de gafas por HFP y el audio USB-C no se pueden ofrecer como dos pistas simultáneas sin un motor/hardware distinto realmente demostrado.
- Si un receptor USB con 2 TX expone dos canales, el prototipo los **describe como dos pistas lógicas** en JSON, pero **todavía no los separa en archivos ni los importa como dos clips al editor**. Conserva el archivo original con ambos canales. Claude podrá importar dos pistas solo después de implementar esa ruta y validarla en dispositivo real.
- Si la entrada USB reporta **exactamente dos canales PCM**, el manifiesto crea dos **referencias lógicas** a canales L/R del mismo CAF (roles `other`, sin presumir que son dos personas ni dos transmisores). No crea dos WAV físicos ni garantiza que los canales sean diferentes; Claude puede separarlos de forma no destructiva cuando los archivos sean compatibles. Otras configuraciones mantienen una sola referencia al archivo original.
- **No incluye** selector de cámara del iPhone; el objetivo de esta rama se limita al audio con video DAT. La futura app unificará cámaras y editor.
- **No se ha instalado ni probado** en iPhone firmado con Ray-Ban, AirPods, DJI u otros micrófonos reales. Compilar Swift y ejecutar test Node no es prueba de hardware.
- **No se presume** que todos los dispositivos USB/BT aparezcan en `availableInputs` ni que AirPods permitan audio de alta calidad en todas las combinaciones de sistema/mode.
- Meta AI sugiere un `Task.sleep(500ms)` fijo y activar BLE como micrófono de DJI. No hay evidencia suficiente de que ambos sean requisito universal. Aquí se verifica la ruta real en vez de imponer temporización arbitraria. Mantener observación FPS/latencia y prueba HFP+DAT con gafas físicas.
- No se implementaron STT «Wivra...», detección de tap, cobro por tours, autoupload a Drive, DJ mix, avatar o nube. Son ideas independientes sujetas a aprobación y verificación.

## Prueba física mínima pendiente
1. Con el iPhone y gafas conectadas: modo HEVC, detectar entradas, escoger Ray-Ban HFP, **preparar** (debe confirmar entrada realmente activa), iniciar DAT, grabar 20–30s con voz y palmada; comprobar original MOV, CAF, MOV combinado, manifiesto y sincronía.
2. Repetir con micrófono integrado iPhone, luego USB-C compatible y AirPods. No mostrar un dispositivo que no haya sido detectado.
3. Durante grabación desconectar fuente y comprobar que Wivra avise y detenga, no que cambie a otro micrófono.
4. Repetir 3–10 min, observar caídas FPS, rutas, calor y latencia/deriva real.
5. Para receptor 2 TX en modo estéreo: verificar si el archivo entregado tiene **canales distintos** (L / R, no un duplicado mono); esta es una futura implementación independiente.

**Para Claude PR #44:** importar v2 con `source`, `inputName`, `sampleRateHz`, `channelCount`, `startOffsetSeconds`, `channelIndex`; 1 captura = grupo de medios en biblioteca. No duplicar audio de `muxedVideoFile`, el MOV combinado es exportación derivada. Priorizar volumen/mute por pista real, no UI de festival.

Fuente oficial iOS: https://developer.apple.com/documentation/avfaudio/avaudiosession/availableinputs y https://developer.apple.com/documentation/avfaudio/avaudiosession/setpreferredinput(_:)

— ChatGPT
