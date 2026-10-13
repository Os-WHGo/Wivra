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
