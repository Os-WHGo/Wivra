# Wivra B1D · seleccionar la fuente de audio sin modo DJ

**Decisión del propietario (13-oct-2026):** lo importante es poder elegir de dónde se recibe el audio. No requiere festivales, DJ, mixer, streamer ni marketplace. El video puede seguir siendo de las Ray-Ban Meta y el audio llegar desde cualquier **entrada real compatible** del iPhone.

Las propuestas de ventas/tours, cloud-sync automático, comandos y gestos NO constituyen instrucciones del propietario.

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

## Decisión: una entrada seleccionada, audio externo en editor y doble micrófono USB opcional (13-oct-2026)

**Instrucción explícita más reciente del propietario:** **descartar la opción DJ**. No habrá modo DJ, selector «External Mixer» especializado, mixer de conciertos ni automatismos ligados a festivales. Un dispositivo de audio USB compatible sigue siendo una **fuente genérica**, sin UI por marca o tipo de evento.

### Contrato simple de producto
1. **Grabar:** usuario selecciona **una entrada de audio activa** detectada por iOS y verifica su ruta. La cámara se elige independientemente. La grabación conserva audio original separado y puede producir video con audio integrado.
2. **Transmitir (objetivo, NO implementado):** el motor LIVE utilizará **esa misma entrada seleccionada** como audio de la transmisión. El selector no significa que el streaming o la transmisión RTMP estén probados; habrá que conectar el capturador a un codificador y probar dispositivo real, permisos, interrupciones y sync.
3. **Editar (trabajo de Claude, NO integrado end-to-end):** el editor acepta **archivos de audio externos grabados antes o después del video**, aunque provengan de otro dispositivo. Importarlos como pistas independientes, posicionarlos por tiempo, recortarlos, ajustar volumen, silenciar y exportar la mezcla. Sincronización inicial **manual** moviendo la pista con ayuda de una palmada o referencia audible; sincronía asistida/automática solo si se demuestra y se prioriza.
4. **Dos micrófonos durante una sola grabación** NO es requisito para que el editor sea multipista. Si una entrada USB entrega dos canales realmente diferenciados, el manifiesto v2 puede referirlos por canal; no agregar conexiones simultáneas HFP+USB ni fabricar archivos extra como requisito del MVP.

### Para Claude (PR #44, issue #47)
- Hacer que «Agregar pista» admita un **archivo de audio local externo** como medio independiente, sin exigir que venga de `.wivra.json`.
- Permitir ajustar el inicio/desfase de la pista en segundos con arrastre y/o entrada numérica, reproducir una vista previa alineada, mute/volumen, deshacer/rehacer, conservar posición al guardar y aplicar la posición durante la exportación.
- Si el archivo procede del manifiesto v2, usar offset de captura como **estimación inicial editable**, nunca como sincronía garantizada. Si el audio es externo, no inventar offset ni ID de hardware.
- Mantener audio original, audio añadido y MOV combinado diferenciados para no reproducir dos veces la voz; probar casos con audio solo, video silenciado y exportación.
- Wivra conserva edición **manual disponible** e IA opcional para ayudar a alinear y editar; no pedir servicio cloud para importar audio local.

**Regla de alcance:** toda propuesta anterior de Meta AI o nota técnica relativa a DJI mixer, festivales, venta de tours o «mini OBS para cabina DJ» es **investigación histórica**, no backlog aprobado. Requiere una nueva petición explícita del propietario para reabrirse. Solo quedan selección de micrófonos genéricos y pistas externas en editor.

— ChatGPT

## Clarificación del propietario: CONSERVAR posibilidad de dos micrófonos (13-oct-2026)

**No eliminar la capacidad de grabación multipista por simplificar la UI.** El propietario quiere poder usar dos micrófonos cuando el receptor compatible los entrega separados, y **controlar el volumen de cada voz durante LIVE** si resulta viable. El modo DJ especializado sigue descartado.

**Hallazgo de fuente primaria:** DJI confirma que los receptores de **DJI Mic 2** y **DJI Mic Mini** en modo **S (Stereo)** envían audio de los dos transmisores por canales separados. En modo **M (Mono)** el receptor los combina y Wivra no puede reconstruir voces independientes de esa mezcla. Ver https://www.dji.com/mic-2/faq y https://www.dji.com/mic-mini/faq. Las compatibilidades de canal estéreo por adaptador/teléfono/modelo requieren prueba real: la existencia del modo S no prueba que iOS reciba los 2 canales USB.

### Tres operaciones distintas, una interfaz simple
1. **Selector de entrada único (en B1D):** elegir receptor/micrófono conectado, verificar `currentRoute`; **una ruta física activa** no significa necesariamente una sola voz. Un receptor puede transportar dos canales dentro de esa ruta.
2. **Grabación (objetivo adicional):** cuando `AVAudioEngine` **mida** dos canales separados en una entrada compatible, preservar los dos en el audio original y representar `channelIndex: 0` y `1` en `.wivra.json` como **pistas lógicas editables**. Esta parte del manifiesto ya tiene un prototipo en PR #51, pero **no se han probado micrófonos físicos ni la edición de esos canales**. No adivinar transmisores por marca ni asignar roles «host/guest» sin identificarlos.
3. **LIVE (a implementar por ChatGPT, NO operativo):** si se dispone de **dos canales PCM independientes**, opcionalmente mostrar **Volumen micrófono 1** y **Volumen micrófono 2** (más mute por canal). Aplicar ganancia por canal, **mezclar ambas voces al centro** en una salida codificada de transmisión. Esto es mezcla de voces básica, **NO modo DJ ni mixer de festivales**. Si el receptor entrega mono, ofrecer un solo control de volumen y no fingir separación.

### Editor (responsable Claude)
- Soportar tanto **canales separados de una grabación** como **archivos de audio externos de otros dispositivos** añadidos después. Los archivos externos se sincronizan manualmente y se guardan como pistas propias.
- Mover, recortar, mute/volumen y exportar cada pista; para canales L/R importados de una grabación estéreo, mantener la fuente original no destructiva y controlar ganancias independientemente.
- Respetar `muxedFromTrackIDs` para evitar sonido duplicado y preservar por defecto audio original.
- No convertir una grabación mono de dos micrófonos ya mezclados en dos pistas falsas; indicar «voz mezclada».

**Prioridad y fases:** selector de fuentes + una pista (en prototipo) → validar recepción de 2 canales por USB con hardware → pistas editables en editor → ganancias independientes y mezcla de 2 voces en LIVE cuando exista transmisión real. El usuario puede grabar y editar con un micrófono sin pasar por estas etapas avanzadas.

**Estado probado:** la compilación genérica iOS y preflight de PR #51 pasaron en commit `1c65cf3`, pero eso no valida la detección/recepción USB/DAT real, la separación audible L/R ni el streaming. No se debe anunciar como función terminada.

— ChatGPT
