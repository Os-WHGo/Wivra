# Wivra · multicámara LIVE, PiP, collage y avatar: separar modos de editor

Fecha: octubre 2026. Fuente: petición del propietario. Estado: SPEC, NO implementado; ningún resultado de hardware ni servidor LIVE real se presume.

## 1. Tres herramientas diferentes dentro del editor

| Modo | Definición | Regla principal |
|---|---|---|
| Transición / corte A→B | Dos tomas consecutivas, con o sin fundido/barrido de duración limitada | No crea V2, ni mantiene las dos tomas transparentes después de la transición |
| Superposición / PiP | Otro video o imagen encima, con posición/tamaño/opacidad/duración propios | El usuario decide dónde y cuánto tiempo se ve; puede continuar sobre varios cortes de V1 |
| Collage / pantalla dividida | 2, 3 o 4 videos visibles simultáneamente en cuadros editables | Mosaicos 2-up, 3-up, 4-up, grande+pequeños, intercambiar posiciones y animar cambio de distribución |

Transiciones también pueden unir dos COLLAGES (scene A y B), o transformar un layout 2-up a uno solo; esto sigue siendo una ventana de cambio delimitada, no obligatoriamente otra toma superpuesta por duración larga. Animar la posición/escala de un cuadro sobre el tiempo (dos keyframes o preset local), ocultarlo, reemplazar su fuente o hacerlo entrar desde fuera de pantalla. Los efectos/filtros se aplican al clip, una pista, una escena o la composición final según selección. Ningún cambio es destructivo. Audio por pista con mute/ganancia, export idéntico a preview.

Cuando una superposición V2 cruza una transición de V1, alertar sin bloquear, permitiendo Mantener / Cortar antes / Ocultar y reaparecer / Fundido del overlay. No modificar audio vinculado ni originales sin decisión. Detalle previo: WIVRA_CONTEXTUAL_TIMELINE_TOOLBAR_OVERLAY_TRANSITION_CHECKS_2026-10-13.md.

## 2. Multicámara LIVE, escenario solicitado

**Objetivo de producto:** mostrar cámara principal de lo que sucede y, opcionalmente, la cámara frontal iPhone pequeña en esquina, al estilo PiP. Reordenar capas en pantalla antes/durante el LIVE. Combinaciones pretendidas:

- iPhone trasera (principal) + frontal (cuadro movible) cuando el hardware lo permita.
- Ray-Ban Meta POV (principal) + frontal iPhone (cuadro movible), pero NO demostrado simultáneo en hardware/SDK: requiere investigación y prototipo físico.
- Ray-Ban Meta o iPhone principal + avatar/ilustración/personaje pequeño, sin revelar el rostro y sin necesidad de encender cámara frontal.
- Collage de 2/3/4 fuentes visuales si disponibles; **cuatro ventanas no significan cuatro cámaras físicas**: puede incluir videos/fotos locales o un avatar.
- Escenas LIVE guardables: A POV pantalla completa, B POV+frontal, C POV+avatar, D collage; cambiar con corte o fundido breve explícito. Preview de escena antes de mandarla al público.

**Permisos:** cámara frontal DESACTIVADA por defecto y encendida solo por elección consciente del usuario, con indicador claro. Avatar 2D estático o animado simple propio/licenciado como primera fase. Face-tracking, seguimiento facial o avatar con lipsync no son prioridad y dependen de permisos/modelos y pruebas, no de IA generativa obligatoria. No mostrar rostro real detrás del avatar de forma transitoria al cambiar escenas.

**Audio:** una entrada iOS seleccionada y validada por currentRoute (#51). Si receptor USB de 2 canales funciona en pruebas, futura ganancia/mute por voz y mezcla al centro; no DJ ni rutas Bluetooth/USB simultáneas inventadas. Salida LIVE codificada H.264/AAC a RTMPS/RTMP, YouTube/Twitch/Custom primero; Instagram/TikTok sujetos a elegibilidad y credenciales autorizadas. No se ha realizado transmisión end-to-end todavía.

## 3. Factibilidad técnica, no promesas

**iPhone dual camera:** Apple publica la API AVCaptureMultiCamSession y un proyecto de ejemplo AVMultiCamPiP para captura simultánea frontal/trasera. Ver https://developer.apple.com/documentation/avfoundation/avcapturemulticamsession y https://developer.apple.com/documentation/avfoundation/avmulticampip-capturing-from-multiple-cameras.

Antes de activar UI, comprobar AVCaptureMultiCamSession.isMultiCamSupported y solo formatos cuyo AVCaptureDevice.Format.isMultiCamSupported sea verdadero. Medir hardwareCost y systemPressureCost: presión excesiva produce paradas/interrupciones; reducir resolución/FPS/cámaras según condiciones y avisar. Fuentes:
- https://developer.apple.com/documentation/avfoundation/avcapturedevice/format/ismulticamsupported
- https://developer.apple.com/documentation/avfoundation/avcapturemulticamsession/hardwarecost
- https://developer.apple.com/documentation/avfoundation/avcapturemulticamsession/systempressurecost

**Ray-Ban DAT:** se reciben frames desde un SDK aparte (MWDATCamera), no es una cámara AVFoundation local. DAT permite abrir stream hacia app según SDK/ejemplo oficial, pero ninguna de las fuentes consultadas garantiza una prueba de coexistencia DAT+AVFoundation frontal y envío RTMP. Probar físicamente antes de publicitar:
https://developers.meta.com/wearables/device-access-toolkit/
https://github.com/facebook/meta-wearables-dat-ios/blob/main/samples/CameraAccess/README.md

**Sincronía:** fuentes distintas pueden tener timestamps/jitter/latencia diversos. Normalizar a reloj de salida, mantener búfer pequeño medido (sin delay fijo sin medición), alinear sonido y video y hacer fallback si cae secundaria. Manejar orientación vertical 9:16/horizontal 16:9, mirror opcional de selfie, tamaño y crop, FPS/resolución y coste térmico. Grabar salida compuesta local si usuario lo activa; guardar streams originales independientes solo cuando hardware permita y con control de almacenamiento.

**Investigación Meta AI:** antes del cambio se leyó carpeta del especialista; hay nuevos documentos de reproductores/export y multimodal/sonidos/memes. Sus tamaños, bitrates, permisos de contenido y capacidades son hipótesis, NO hechos demostrados para Wivra. No introducir biblioteca de memes o efectos generativos sin nueva petición. Meta especialista deberá investigar DAT + frontal iPhone y registrar hallazgos con evidencia.

## 4. Contrato de composición conceptual, NO código implementado

- VideoSource = (id, kind: iphone_back | iphone_front | meta_dat | local_media | avatar, availability, permissionState).
- LiveLayer = (id, sourceId, visible, zIndex, rect normalizado x/y/w/h de 0 a 1, opacity 0..1, cropMode cover/contain, mirror).
- LiveScene = (id, layers[], outputAspectRatio, selectedAudioInputUID, transitionToNext {cut/fade,durationSeconds}).
- Transición opera entre escenas compuestas con duración finita, nunca genera una pista oculta infinita ni duplica el audio.
- Layer/scene editables en preview ANTES de LIVE; cambios durante LIVE se muestran en staging y se aplican al pulsar Transmitir escena cuando proceda.
- Interfaz muestra solo fuentes realmente conectadas/permisos concedidos; desconexión de secundaria → aviso + principal continúa si posible; desconexión de principal → escena de espera claramente señalada/pausa segura, no engañar.
- Reutilizar conceptos de layout de editor offline pero mantener distintos renderers/adaptadores donde sea necesario: **no duplicar ni reescribir editor de Claude**.

## 5. Pruebas / pasos de implementación por separado

**Editor: Claude PR #44**
1. Dos clips sucesivos V1 corte simple, luego transición 0.5s con handles, sin V2 artificial.
2. Superposición V2 entre 8–13s sobre corte V1 en 10s; advertencia no bloqueante, opciones conservar/ocultar/fade, con undo.
3. Collage 2-up/3-up/4-up de archivos locales, tamaño/posición/alpha/swap, animación de cuadro pequeño a grande, transición entre collage y fullscreen. Export y reproducción idénticos. Pistas audio independientes. Proyecto reabre y funciona offline.
4. Evaluar motor OpenReel/OpenCut/actual sin copiar CapCut ni sustituir engine sin aprobación.

**Captura/LIVE: ChatGPT módulo streaming/**
1. MC1: prueba real iPhone frontal+trasera con AVCaptureMultiCamSession: permisos, isMultiCamSupported, formatos, hardwareCost, systemPressureCost, 30s/5min, elección audio, salida compuesta y sincronía.
2. MC2: prueba real DAT Ray-Ban + frontal iPhone: frames concurrentes, mic HFP/USB, timestamps, reconexión, calor; 30s/3min/10min. No marcar compatible hasta pruebas.
3. MC3: RTMPS a destino autorizado con preview PiP, cambio de escenas, orientación, bitrate/FPS audio sincronizado, reconexión, consulta desde otro dispositivo y stream key protegido en Keychain. Empezar 1 destino. Avatar estático es alternativa a cámara frontal.
4. Marcar NO COMPATIBLE o PENDIENTE por fuente/hardware cuando corresponda, y evitar controles ficticios.

**Responsabilidades:** Claude posee app/ y core/; ChatGPT captura y LIVE bajo streaming/; Meta AI solamente investiga Meta/DAT. Sin merge a main sin aprobación del propietario.
