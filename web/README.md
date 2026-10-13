# AgentCut · Web móvil (prototipo M0)

**Estado: código experimental, no probado todavía en un teléfono real.** Propuesta técnica para revisión de Claude y del propietario; no altera `main`.

## Prioridad

1. En **Safari de iPhone y Android** abrir esta página, seleccionar video, ajustar inicio/fin, escribir texto y exportar.
2. Luego verificar compatibilidad real con 10, 30 y 60 segundos de material.
3. **Después** integrar chat, herramientas, voces, conectores y mini IA. Este prototipo **no tiene IA**.

## Ejecución

Solo existe `web/index.html`. No requiere Node.js, npm, herramientas de compilación, cuenta ni computadora **para utilizar la versión publicada**. Para probar por HTTPS hace falta que el responsable habilite un hosting estático como GitHub Pages (por ejemplo desde una rama de prueba) o publique este archivo sin cambiar `main`. **No se ha desplegado ni hay URL pública de prueba confirmada.**

La entrada acepta archivos seleccionados desde Fotos/Archivos. El video usa URLs locales `blob:`. No hay `fetch`, CDN ni backend; el clip y el video exportado permanecen localmente en el navegador. No ofrece almacenamiento persistente de proyectos.

## Diseño técnico y limitaciones (importantes)

- La línea de tiempo es un **rango numérico y controles táctiles**, no arrastrar clips. Es un proyecto de un solo clip.
- Vista previa: `<video playsinline>` y texto superpuesto con CSS. Exportación: `canvas.captureStream` + `MediaRecorder` + audio original a través de `AudioContext.createMediaElementSource` / `MediaStreamDestination`. Se comprueba `MediaRecorder.isTypeSupported` por dispositivo; intenta MP4 y si no, WebM. El video se **graba en tiempo real**, no se reencodea por lotes.
- **Verificado por documentación de APIs, no en hardware:** Safari soporta `canvas.captureStream` y el API `MediaRecorder`. WebKit documenta grabación MP4/H.264/AAC; no garantiza que la combinación exacta, mezcla de sonido y descarga funcione con cualquier versión y clip. Fuentes: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream y https://webkit.org/blog/11353/mediarecorder-api/ .
- **No usar** `HTMLMediaElement.captureStream` para Safari iOS (no soportado según https://caniuse.com/mdn-api_htmlmediaelement_capturestream ).
- **No verificado:** audio final en Safari, sincronización A/V, permisos del navegador para reproducir tras rebobinar, flujo Files/Photos de iOS, memoria, exportaciones largas y orientación en background. Si falla con audio, desactivar `Conservar audio original` como diagnóstico; no asumir que el sonido se mantiene.
- Puede haber saltos por suspensión, falta de memoria, tasa de cuadros irregular o codificación del dispositivo. La edición y su tamaño final no son aptos para producción todavía. Una exportación interrumpida no debe usarse.
- `MediaRecorder` no ofrece edición precisa de fotograma ni velocidad superior a tiempo real. Buscar WebCodecs y muxer abierto en una etapa posterior solo si esta prueba falla, auditando licencias.

## Pruebas en iPhone/Android (propietario)

1. Abrir URL HTTPS del despliegue de prueba en Safari iPhone; repetir en Chrome Android.
2. Importar MP4/H.264 de **22 segundos**; confirmar que se ve y reproduce.
3. Mover la barra sin arrastre de clips; fijar inicio `2` y fin `8`.
4. Escribir `AgentCut prueba`; comprobar texto en pantalla.
5. Exportar con audio, guardar y abrir el archivo descargado. Verificar duración aprox. 6 segundos, texto y **sonido**.
6. Repetir sin audio si falló; anotar versión iOS/Android, modelo, formato MP4/WebM, error mostrado y tiempo.
7. Confirmar que el archivo fuente no cambió y no hubo subida de red.

| Prueba | iPhone Safari | Android Chrome |
| --- | --- | --- |
| Importación | **No verificado** | **No verificado** |
| Barra táctil/cortes | **No verificado** | **No verificado** |
| Texto | **No verificado** | **No verificado** |
| Exportación | **No verificado** | **No verificado** |
| Audio exportado | **No verificado** | **No verificado** |

## Licencias

Esta prueba utiliza **solo APIs web estándar y código propio**; no copia ninguna porción de OpenCut, Concat ni de CapCut, ni descarga librerías. La licencia final de AgentCut la decidirá el propietario. Fuentes de compatibilidad enlazadas arriba.

## Nota para Claude

Revisar especialmente la ruta `ensureAudio` y el manejo de errores al iniciar MediaRecorder en Safari. Solicitar prueba real de importación/corte/texto/exportación **antes de fusionar**. La política de voces del PR #4 es posterior a esta primera etapa.

— ChatGPT
