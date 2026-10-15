# app · Prueba para teléfono (iPhone y Android)

**ES ·** Una sola página (`dist/agentcut.html`) hecha para el teléfono: botones grandes, texto de 16 px (sin zoom en iOS), elegir el video con el selector del teléfono (no hace falta "pegar" nada). Usa el núcleo de `core/`.

- **Línea de tiempo visual** (`timeline.mjs` + `template.html`): bloques con miniaturas, línea blanca, tocar para elegir un clip, arrastrar los bordes amarillos para recortar, cortar, borrar (cierra el hueco), texto, deshacer/rehacer y zoom. Cada gesto es un solo paso de deshacer.
- Recorte por números: queda como opción avanzada.
- Con tu IA, sin API: la app arma un mensaje, lo pegas en ChatGPT o Claude normales, pegas la respuesta de vuelta y el validador la aplica o la rechaza.
- Vista previa básica del resultado. **No exporta todavía.**

Regenerar el archivo: `node app/build.mjs`.

**Probado:** en Chromium simulando iPhone 13 con un video de 22 s (carga, recorte 2–8, texto, rechazo de 100 s, respuesta de IA con bloque ```json, deshacer, sin scroll horizontal).
**NO probado:** Safari de iPhone real, Chrome de Android real, videos del teléfono (HEVC/H.264 .mov), videos largos, el botón de copiar al portapapeles en iOS.

— Claude

**Línea de tiempo, probado:** Chromium simulando iPhone 13 (cortar, borrar, deshacer, arrastrar borde, texto, zoom, reproducir). **NO probado:** arrastre con el dedo en un iPhone real, videos largos, miniaturas en Safari.

**Diseño de editor (pantalla de teléfono):** barra superior, vista previa grande, fila de controles (tiempo, reproducir, deshacer/rehacer), línea de tiempo con la línea blanca **fija al centro** (se desliza el contenido, no la línea) y barra de herramientas abajo (Cortar, Borrar, Texto, IA, Observar). Texto, IA y Observar abren una hoja desde abajo. Los iconos, colores y nombres son propios. Audio, Efectos y Subtítulos aparecen marcados "pronto" porque aún no existen.
**Probado:** Chromium simulando iPhone 13 (cargar, deslizar la línea de tiempo, cortar, borrar, deshacer, recortar arrastrando, texto, IA con JSON pegado, reproducir). **NO probado:** iPhone real, pantallas pequeñas (SE) ni horizontal.

**Varios videos y orden (hoja "Videos"):** se pueden elegir varios videos a la vez con el selector del teléfono (en iPhone abre Fotos, incluida iCloud si está activada; en Archivos se pueden navegar iCloud Drive y otras ubicaciones; **[NV]** Google Fotos y otras apps dependen del sistema). Luego aparece una lista con cuadritos para cambiar el orden arrastrando el ≡ o con ▲ ▼; el video se rearma en ese orden (un solo deshacer). Una página web **no puede listar la galería por su cuenta**: solo ve lo que la persona elige en el selector del sistema.
**Probado:** Chromium simulando iPhone 13 con 3 videos (carga, reordenar con botones y arrastre, deshacer, reproducir cruzando los 3). **NO probado:** iPhone real, muchos o muy largos videos, cambio de video durante la reproducción en Safari (puede haber un pequeño salto), iCloud/Google Fotos.

## Exportar (nivel: probado en navegador de escritorio simulando iPhone; NO validado en iPhone real)

`export.mjs` graba el resultado dentro del teléfono: reproduce cada clip en orden (con su audio), lo dibuja en un canvas con los textos y lo guarda con `MediaRecorder`. Sin servidor, sin librerías, sin subir nada; los originales no se tocan.
- **Va en tiempo real:** un video de 20 s tarda unos 20 s. La pantalla debe seguir encendida y la pestaña abierta.
- **Formato:** MP4 si el navegador lo permite (Safari), si no WebM. Tamaño: forma del primer video, máx. 1080 en el lado corto.
- **Probado:** 2 clips con tonos de 440 y 880 Hz + texto → salida de 7 s con audio correcto, texto visible y cambio de clip (Chromium con iPhone simulado).
- **NO probado / por validar en iPhone real:** que Safari grabe el audio de los clips (`createMediaElementSource`), formato MP4 resultante, ".mov" HEVC, y el menú "Guardar o compartir".
- **Límite conocido:** no hay mezcla de audio por pistas ni música aparte; el audio es el de cada clip.
- Alternativa futura, más rápida que tiempo real: WebCodecs con Mediabunny (MPL-2.0; sin verificar en Safari/HEVC).

## IA directa (sin copiar y pegar)

`ai-client.mjs` conecta la hoja **IA** con un proveedor compatible con OpenAI (`/chat/completions` + herramienta `edit_apply`). Pegas tu clave, escribes la petición, la IA **propone** operaciones, la app las valida y tú tocas **Aplicar** (un solo deshacer). Copiar y pegar queda como opción sin clave.
- **Privacidad:** la clave solo vive en la memoria de la página (no se guarda; hay que pegarla en cada sesión). Se envía solo tu petición y un resumen del proyecto (id, nombre, duración, clips, textos). **Nunca el video.**
- **Proveedores precargados** (direcciones de su documentación): Google Gemini (AI Studio), Groq, OpenRouter, OpenAI (de pago), u otro compatible.
- **GitHub Models ya no existe:** GitHub lo retiró el 30-07-2026 (docs.github.com/en/github-models). No usarlo.
- **Nivel:** probado con un proveedor SIMULADO (24 pruebas de app, más un recorrido completo en Chromium: pedir → proponer → aplicar → deshacer; la clave no sale en el cuerpo ni se envía el video).
- **NO verificado:** que cada proveedor acepte llamadas desde una página web (CORS), que el modelo precargado exista con ese nombre, los límites del plan gratis, ni la calidad de las propuestas. Sin ver el video, la IA solo trabaja con nombres y duraciones.

### IA directa · conversación, reintentos y dictado (nivel: probado con proveedor y micrófono SIMULADOS)
- **Conversación:** la hoja IA recuerda lo que pidieron y lo que se aplicó o descartó (hasta 12 turnos), así puedes corregir ("mejor en el segundo 3"). El proyecto que ve la IA siempre es el de ahora. "Nueva conversación" la borra. El historial vive solo en la página.
- **Reintentos:** si el proveedor responde 429/500/502/503/504, se reintenta 2 veces (espera 2 s y 5 s) y avisa en pantalla. Clave inválida (401) o corte de red/CORS NO se reintentan.
- **Voz:** botón "Dictar" con Web Speech del navegador (si existe) para instrucciones largas; si no existe, se indica usar el micrófono del teclado. El dictado lo hace el navegador y podría usar servidores de Apple/Google (sin verificar); Wivra no guarda audio. **No validado en iPhone real.**
- **Pruebas:** 28 de app; recorrido en Chromium con 503 + reintento, dictado simulado y dos turnos de conversación.

## Integración (rama `claude/integration-director`)
Une en UN solo archivo: editor multivideo (#38) + Director creativo (#39) + checklist y agente local (#40, de ChatGPT) + exportación (#42) + IA directa (#43). Conflictos resueltos en `template.html` y `build.mjs`; `dist` regenerado. Sin nombres repetidos entre módulos.
- **Probado (Chromium con iPhone simulado):** abrir el Director sin video y con 2 videos, pedir un corte a un proveedor simulado y aplicarlo, exportar con audio. Sin errores de consola. 22 pruebas de núcleo y 28 de app.
- **Pendiente de integrar de verdad:** el "agente local básico" del #40 (`localBasicCommand`) y la IA directa (#43) son caminos separados; falta unificar la conversación para que el Director y la IA compartan el mismo historial y las mismas notas por video.
- La barra inferior ya tiene 7 botones activos y se desliza hacia el lado en pantallas angostas (el de "Director" queda parcialmente fuera hasta deslizar).

## Audio por clip (nuevo)
- Operación `set_clip_audio {clip_id, muted?, volume?}` (volumen 0–2, 1 = original). Se valida, es atómica y se deshace como todo lo demás; al cortar un clip, las dos mitades conservan su audio. La IA también puede proponerla.
- Botón **Audio**: silencia o cambia el volumen del clip elegido. La exportación aplica la ganancia por clip (WebAudio).
- **Probado:** pruebas unitarias del núcleo y navegador simulado (hoja Audio, silenciar, volumen, deshacer ×2, sin errores). **No validado:** que el audio exportado salga con el volumen correcto en un iPhone real. En la vista previa de Safari/iPhone el volumen no cambia (solo silenciar), es una limitación de Safari (sin verificar con fuente).


## Importar una captura (`.wivra.json`) · estado 14-10-2026
- Botón **Captura**: se eligen juntos el `.wivra.json`, el video y los audios. El manifiesto se valida (v1 y v2) antes de tocar nada.
- Se abre el video original; si el navegador no puede, se usa el video combinado (MOV) si fue elegido. Con el video combinado, las pistas que ya trae **no se importan dos veces**; si se dan también sueltas y se abren todas, quedan como pistas aparte y el audio del video se silencia.
- Cada pista de audio entra como **clip de audio** (`audioClips`, ids `u1`, `u2`…) con su desfase (`startOffsetSeconds`; si cae antes del inicio se recorta ese tramo). Todo en **un solo lote** (un solo deshacer).
- Las pistas de audio se ven en su propia fila con parlante, suenan en la vista previa y se **mezclan en la exportación** (verificado con análisis de frecuencias en Chromium simulado: arranca y termina en el tiempo esperado).
- **No hecho / no verificado:** separar canales de un mismo archivo (se reproduce el archivo completo y se avisa), volumen en la vista previa de iPhone (iOS ignora `volume`; solo silenciar), decodificar CAF/HEVC en Safari, prueba en iPhone real, audio por encima de 1 en la vista previa (solo en la exportación).


## Pistas, superposición y selección por partes · 14-10-2026 (tarde)
- Columna fija de nombres de pista a la izquierda de la línea de tiempo y botón **＋ Pista** debajo: agrega un **video encima del video** (hasta 2 pistas encima, en la interfaz) o una **pista de audio**, en el punto donde está la línea blanca.
- Un video superpuesto tiene tamaño (5–100 % del ancho), posición (centro x/y) y pista; se mueve **arrastrándolo** en la pantalla o con los controles (botón **Superponer**: tamaño, posición, esquinas, pantalla completa, silenciar). Operaciones del núcleo: `add_overlay_clip`, `set_overlay`; mover/recortar/cortar/volumen/borrar sirven igual en estos clips.
- **Elegir por partes:** tocar el video elige solo el video; tocar la barra verde de abajo elige solo su audio. Con el audio elegido, el botón dice **Quitar audio** (silencia ese tramo; se deshace y se devuelve con el parlante).
- Al soltar la barra de tiempo después de moverla, la reproducción **continúa** si estaba sonando.
- La exportación dibuja las capas (pista mayor = más arriba) y mezcla su audio. Verificado en Chromium simulado: el color del video superpuesto aparece en el cuadro exportado mientras dura y desaparece al terminar.
- **No hecho / no verificado:** pellizcar para cambiar tamaño (solo controles), rotación, recorte/forma (círculo), pantalla verde, transiciones, grabar voz con el micrófono, más de 2 pistas encima en la interfaz, que el video superpuesto dure más que el video principal (se corta al final del principal), prueba en iPhone real, vista previa de varios videos a la vez en iPhone (la prueba corta de 2 videos en lienzo sí funcionó; reproducir 3 `<video>` a la vez en pantalla no está medido).

## Formato, altavoces por pista, mover, borrar conservando audio, tamaño con los dedos · 14-10-2026 (noche)
- **Formato** (botón de la barra de abajo): Original, 9:16, 1:1, 4:5, 16:9, y *Rellenar* (recorta lo que sobra, centrado) o *Entero* (barras). Operación `set_format`; el cuadro de la vista previa y la exportación tienen esa forma. Proyectos viejos sin `format` siguen valiendo.
- **Altavoz por pista** en la columna de nombres: silencia o activa toda la pista de una vez (un solo deshacer).
- **Mover con la mano**: toca un bloque para seleccionarlo y arrástralo (audio y superpuestos de lado a lado; el superpuesto también cambia de pista; los clips de video principal se reordenan).
- **Borrar un tramo**: borra de verdad, no solo silencia. En el video principal pregunta si quieres borrar todo o **solo la imagen y conservar el sonido** (queda negro con el audio en su sitio; se reproduce y se exporta).
- **Tamaño del superpuesto con los dedos**: pellizco sobre el video o círculo amarillo en su esquina.
- Estado: **implementado + pruebas automáticas (núcleo 44, app 41) + navegador simulado Chromium**. **No probado en iPhone.**

## Agregar, efectos, mover con pulsación larga, audio quitado · 14-10-2026 (tarde-noche)
- Botón **Agregar** en la barra de abajo: elige un video (va como capa encima, con tamaño y posición) o un audio (pista aparte), donde está la línea blanca.
- **Efectos** (botón de la barra): al aparecer / al desaparecer = Fundido, Deslizar o Zoom, con duración de 0,1 a 3 s, para video principal y capas. Operación `set_clip_fx`; al cortar, la entrada queda en la primera parte y la salida en la última. Misma fórmula (`fxAt`) en la vista previa y en la exportación.
- **Mover**: mantén el dedo ~0,3 s sobre cualquier bloque (audio, capa, video) y arrástralo; si ya está elegido, se arrastra directo.
- **Quitar audio** de un tramo ahora silencia también la vista previa (antes solo se marcaba) y el tramo queda vacío con borde de puntos; «Poner audio» lo devuelve. Se quitaron los iconos de parlante dentro de los bloques; quedan los de la columna izquierda (por pista).
- Estado: **implementado + pruebas automáticas (núcleo 45, app 41) + Chromium simulado**. **No probado en iPhone.** Transiciones entre dos clips (cruce) y «separar audio» aún no.

## Más pistas, mover entre pistas, pantalla ampliada · 14-10-2026 (noche)
- Botón **+** en la columna izquierda, en la fila de Video (otra capa de video encima) y en la de Audio (otra pista de audio). Hasta 3 filas de video encima y 3 de audio; siempre queda una fila vacía para soltar un clip en ella.
- Mantén pulsado un bloque y arrástralo **hacia arriba o abajo** para cambiarlo de pista (video encima y audio). Audio: `track` en `add_audio_clip` y operación `set_audio_clip` (pista y papel: voz 1, voz 2, música).
- Círculo amarillo de tamaño más pequeño (el área para tocarlo sigue siendo grande).
- **Pantalla ampliada**: botón ⤢ sobre la pantalla o doble toque; esconde la línea de tiempo y la barra.
- Estado: implementado + pruebas automáticas (núcleo 46, app 41) + Chromium simulado. **No probado en iPhone.** Subtítulos automáticos desde audio y pistas de texto aparte: **no hechos** (ver decisión pendiente).

## Poner un video encima moviéndolo de fila · 14-10-2026 (noche)
- Encima de la fila de Video hay siempre una fila de capas (la más alta de la lista va arriba en pantalla). Mantén pulsado un clip del video principal y suéltalo en esa fila: pasa a ser una capa. Arrastra una capa hacia abajo, al video principal: vuelve a ser parte del video (si el lugar está ocupado, queda al final). Un solo deshacer.
- «Agregar» ya solo tiene **Video** (se suma al final) y **Audio**; las capas se hacen arrastrando (o con el + de la fila de Video). El botón «Superponer» se llama ahora «Capa» (tamaño, posición, silenciar).
- Estado: implementado + Chromium simulado. **No probado en iPhone.**

## Capas debajo del video, insertar en el corte, formas · 14-10-2026 (noche)
- **Orden de filas:** Video (donde están los cortes), su audio, y debajo **Capas** (la de arriba va más adelante). Arrastrar un clip principal a las filas de Capas lo convierte en capa; arrastrar una capa hacia arriba lo devuelve al video principal.
- **Agregar video** se mete en el corte más cercano a la línea blanca (inicio, entre clips o final) y corre lo que sigue; no se corta ningún clip.
- Botón **Capa**: **Forma** (Normal, Redondeado, Círculo, Corazón, Estrella, Rombo, Triángulo, Hexágono), **Zoom y mover el video dentro de la forma**, y **Traer adelante / Mandar atrás**. Núcleo: `set_overlay` con `shape`, `zoom`, `px`, `py`. Misma geometría en vista previa (clip-path SVG) y exportación (Path2D; comprobado un fotograma con corazón).
- Estado: implementado + pruebas automáticas (núcleo 47, app 41) + Chromium simulado. **No probado en iPhone** (clip-path con url() en Safari/iOS: **NV**). Las formas aún no se pueden dibujar a mano ni importar como vector.

## Biblioteca de formas, marco y transparencia · 14-10-2026 (noche)
- Botón **Capa**: 16 formas con dibujo (Normal, Redondeado, Cuadrado, Cuadrado suave, Círculo, Óvalo, Corazón, Estrella, Rombo, Triángulo, Hexágono, Nube, Mancha, Salpicadura, Flor, Globo, Rasgado), **marco** (grosor y 6 colores), **transparencia** (10–100 %), zoom y mover el video dentro de la forma, y el preajuste **Pantallita en la esquina** (cuadrado redondeado con marco blanco, 32 % de ancho, abajo a la derecha).
- Núcleo: `set_overlay` con `shape`, `frame` (0–0,1), `frameColor` (#rrggbb), `opacity` (0,1–1). Todo se conserva al cortar y se deshace.
- La hoja de Capa es más baja para que se vea la pantalla mientras eliges.
- Estado: implementado + pruebas automáticas (núcleo 48, app 41) + Chromium simulado (vista previa y fotograma exportado con nube/marco/transparencia). **No probado en iPhone.** Formas dibujadas a mano o importadas como vector: no hechas. «iPhone Dual» (cámara frontal y trasera a la vez): **no verificado**; lo que sí se puede es importar las dos tomas y poner una como pantallita.

## Guardar y reabrir el proyecto (corte mínimo)

- Se guarda solo, 0,7 s después de cada cambio, en el propio teléfono (IndexedDB). No se sube nada a ningún servidor.
- Se guarda: el proyecto completo (clips, capas con forma/marco/transparencia/zoom/efectos, audios y pistas, textos, formato) y los archivos originales (video/audio) como copia local. NO se guarda el historial de deshacer.
- Si el teléfono no deja guardar un archivo (poco espacio) el proyecto se guarda igual; al reabrir aparece «Faltan archivos» y se reconectan eligiéndolos otra vez (se emparejan por nombre; se comprueba la duración). Exportar queda bloqueado mientras falte alguno.
- Proyecto dañado o de una versión más nueva: se avisa y no se pisa; los clips imposibles se descartan con aviso; proyectos viejos sin `format`/`overlayClips`/`audioClips`/`nextId` se migran (`app/persist.mjs`, esquema `wivra-project` versión 1).
- «Empezar un proyecto nuevo» (hoja «Tus videos») borra lo guardado.
- Verificado en Chromium simulado (no iPhone): guardar → cerrar → reabrir idéntico, seguir editando, deshacer, agregar video sin choque de ids, exportar, archivo faltante y reconexión, datos dañados. **NO verificado en iPhone**: límites de espacio de Safari, posible borrado automático por el sistema (se pide `storage.persist()` pero iOS puede ignorarlo), videos muy grandes (se duplican en el almacenamiento local), comportamiento en modo privado.

## Pantalla de inicio y «Mis proyectos»

- Al abrir la página aparece el **inicio**: Editor de video (proyecto nuevo), Director (lista de tomas), y «Transmisión en vivo» y «Plantillas» como *pronto* (sin función todavía). Debajo, **Mis proyectos**: tocar uno lo continúa; «Nombre» lo renombra; «Borrar» lo elimina del teléfono.
- Varios proyectos guardados (IndexedDB v2: `pj`, `pb`, `pi`); el proyecto único de la versión anterior se migra solo como «Proyecto anterior». Rutas: `#new`, `#new-director`, `#p=<id>` (un refresco vuelve al mismo proyecto; cambiar de pantalla recarga la página limpia).
- Botón **‹ Inicio** en el editor → «Guardar y salir», «Seguir editando», «Descartar cambios de esta sesión» (el proyecto vuelve a como estaba al abrirlo; en un proyecto nuevo lo borra) y «Borrar el proyecto». También guarda al pasar la pestaña a segundo plano.
- Verificado en Chromium simulado (no iPhone). NO verificado en iPhone: gesto «atrás» de Safari con las rutas `#`, guardado al cerrar la pestaña desde el selector de apps.
