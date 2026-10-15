# Wivra LIVE Studio · B2 Scene Deck (núcleo de control, NO transmisor)

**Estado:** código JavaScript modular (`streaming/live/scene-deck.mjs`), pruebas automáticas (`streaming/tests/live-b2-scene-deck.test.mjs`) y contrato de evento. **NO es aún una pantalla iOS**, compositor nativo, emisión RTMP/RTMPS, reproducción de audio/video real ni archivo MOV de LIVE. Se desarrolla independiente del Editor de Claude, bajo la rama de captura de ChatGPT. Prohibido etiquetar como «LIVE funcional» hasta prueba real.

## Capacidades implementadas
- Crear sesión de LIVE por `projectId`, lienzos `9:16`, `16:9`, `4:5` y `1:1`, con assets compartibles conceptualmente con Editor: imagen, video, audio, `source` (incluido/usuario/pack/proveedor) y `cached`.
- Registrar hasta **64 escenas**, de **1 a 4 capas** combinando cámara verificada (ID externo), video local, imagen local y rótulo CG 2D simple. Geometría normalizada `x/y/width/height` en 0..1, alpha 0..1, escena `single/pip/split/grid`. **Definir cuatro tiles NO equivale a disponer de cuatro cámaras**.
- Preparar escena `cueScene` para Preview sin modificar Programa; `takePreview` la pasa a Programa solamente si sigue siendo válida la cámara y el recurso local; **Programa NO significa que está transmitiendo por red**.
- Hasta **12 botones del Deck**: `take_scene`, `show_image`, `play_video` y `clear_media`. Imagen/video solo si está en caché; no descargar en plena emisión. Comandos se guardan como eventos con milisegundos, orden y revisión.
- `observeEncoder` acepta estado `ready`/`live` solo con evidencia proporcionada por adaptador real `encoder-ack`, `stopped` con `encoder-stopped`, `failed` con `encoder-error`. **Este módulo no conecta ni verifica un encoder; la aplicación nativa debe pasar eventos de su encoder real, no valores inventados por UI**.
- `makeEditingLog`: exporta cue sheet con `scene-preview`, `scene-take`, `image-show`, `video-trigger`, `media-clear` y cambios de caché/encoder. Declara `mediaRecorded:false` y `encoderValidated:false` porque el log **no es una grabación**.

## Ejemplo lógico sin cámara conectada

```js
import {createStudioState, cueScene, takePreview, pressDeck} from './scene-deck.mjs';
const state=createStudioState({
  projectId:'walking-tour-1',
  assets:[{id:'meme-cat',kind:'image',source:'user',cached:true}],
  scenes:[{id:'title',layout:'single',layers:[
    {id:'headline',kind:'cg',text:'Bienvenidos a Whistler',
     rect:{x:0.1,y:0.08,width:0.8,height:0.2}}
  ]}],
  deck:[{slot:1,action:'take_scene',targetId:'title'},
        {slot:2,action:'show_image',targetId:'meme-cat'}]
});
const preview=cueScene(state,'title',1000);
const program=takePreview(preview,1050);
const showMeme=pressDeck(program,2,3000);
// Es solo PLAN: no se ha enviado video a Twitch ni grabado MOV.
```

## Integración nativa requerida, siguiente fase B2B
1. **AssetManager iOS:** resolver `assetId` a archivo local dentro del sandbox, verificar integridad/licencia/códec, leer miniaturas y controlar espacio; nunca construir URLs del proveedor en el controlador de escenas ni ejecutar shaders/plugins remotos.
2. **Cámara Meta y/o iPhone:** adapter entrega `readyCameraInputs` solo después de apertura real; prioridad una entrada estable, no prometer DAT+frontal simultáneo sin test. Validar recursos térmicos, FPS, permisos, batería y cierres conservadores.
3. **Compositor nativo:** interpretar `rect`, alpha, CG 2D, PiP/split/collage, transición `preview -> program`; generar frames en vivo. Audio mezclado, ducking y videos de deck requieren implementación propia con AVFoundation/Metal/Audio Engine con pruebas en iPhone.
4. **Publisher:** RTMP(S) y plataforma social con permisos/llave segura, estado `LIVE` solo tras ACK real. Identificadores y tokens nunca en JSON de escenas. Eventos Twitch/YouTube de audiencia requieren OAuth/event APIs aparte, NO vienen en llave RTMP.
5. **Registro:** guardar composición real si el usuario lo activa, timebase de host y sincronización PTS, sidecar de eventos con IDs/offsets conectados a media real, importar en Editor sin inventar contenido. El log actual es **cue sheet**, no evidencia de video ni timestamps de media.
6. **UI iPhone:** pantalla táctica de vista previa, Programa y deck, botones grandes, indicador de conexión auténtico, preflight de descargas y cámaras, safe areas 9:16/16:9 y «salir del aire» explícito.

## Pruebas y límites
- Tests Node de orden de eventos, estado offline, escenas/cámaras no verificadas, no descargar recursos remotos en LIVE, no solapar assetID erróneos, geometría normalizada y límites de 12 botones.
- No hay prueba de simulador iOS ni hardware Ray-Ban/iPhone para este módulo de planeación.
- No fusionar a `main` ni alterar el Editor de Claude sin revisión cruzada.
- El control de escenas solo almacena información necesaria: **no incluye video, audio, claves ni URL privadas**.

### Coordinación
- ChatGPT: Scene Deck, contrato live, integración futura iOS/captura/publisher.
- Claude: Editor, timeline, motor multipista y revisión de lectura v2 del manifiesto.
- Propietario: aprueba integración final, pruebas físicas y merges.

— ChatGPT · B2 primera pieza funcional, sin emisión real.
