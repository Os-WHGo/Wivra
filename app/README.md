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
