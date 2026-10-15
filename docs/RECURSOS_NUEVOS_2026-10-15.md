# Recursos nuevos para Wivra (repaso del 15 oct 2026)

> **Propuesta de Claude. Son candidatos, no decisiones: decide el propietario.** Solo incluye lo que NO estaba en `RESOURCES.md` ni `OPEN_SOURCE_MAP.md`. **[V]** = leí la página oficial ese día; **[NV]** = no lo pude verificar. Una pieza sin licencia confirmada no se copia. Esto no es consejo legal. No se copió código de nadie.
> Límite del repaso: solo pude leer páginas públicas (no la API de GitHub), así que fechas de último cambio faltan en varios casos.

## 1. Editores abiertos para estudiar (referencia de ideas, no dependencia)

| Proyecto | Licencia | Qué tiene y qué nos sirve | Límite |
| --- | --- | --- | --- |
| [OpenReel Video](https://github.com/Augani/openreel-video) | MIT [V] · 4,4 mil ★ [V] · v0.5.0 (30 may 2026) [V] | Mediabunny + WebCodecs + WebGPU. Transiciones (fundido, barrido, deslizar), fotogramas clave con 20+ curvas, **color con LUT y ajustes preparados**, subtítulos SRT con palabra resaltada, exporta MP4/WebM. Soporta Safari 16.4+ según su tabla | «Optimización móvil» está solo en su plan [V]. No dice si probaron en iPhone |
| [FreeCut](https://github.com/walterlow/freecut) | MIT [V] · 2,1 mil ★ [V] | Transiciones (fundido, barrido, deslizar, giro 3D, iris, destello), efectos y clave de croma, **transcripción en el dispositivo** que crea los subtítulos | Pide Chromium de escritorio [V]; móvil: no dice |
| [Timeline Studio](https://github.com/MartinDelophy/ai-video-editor) | MIT (su código; modelos y recursos con licencias propias) [V] · 893 ★ [V] | **El más parecido a nuestra idea:** personas e IA editan la misma línea de tiempo. Las IA mandan *planes de edición* en JSON con **revisión, simulación previa (dry-run), IDs idempotentes** y comandos `inspect/diff/render`; 21 herramientas por WebMCP [V] | Escritorio Chromium [V]. No leí su esquema de operaciones [NV] |

**Qué hacer con esto:** nada de copiar. De Timeline Studio, ideas para nuestro motor de operaciones (ya tiene revisión y todo-o-nada): **simulación previa** (mostrar «qué pasaría» sin aplicar), **IDs idempotentes** (que repetir el mismo lote no duplique) y un **diff** legible. De OpenReel y FreeCut, lista de transiciones y LUT como guía de funciones.

## 2. Transiciones

- **[GL Transitions](https://github.com/gl-transitions/gl-transitions)** (colección abierta, paquete npm `gl-transitions`): cada transición es un pequeño programa GLSL `vec4 transition(vec2 uv)` con `progress` de 0 a 1, `getFromColor/getToColor` y parámetros con valor por defecto [V]. Cada una trae su campo `license` y autor [V], pero **no pude leer cuántas hay ni el valor de cada licencia [NV]**.
- **Encaje:** nuestro dibujo con WebGL (`fxRender`) ya mezcla imágenes; una transición entre dos clips es el mismo esquema con dos texturas. Haría falta una operación nueva (`set_transition`) y su exportación: **cambio de contrato, requiere tu visto bueno**.
- **Antes de usar:** revisar la licencia de CADA transición que elijamos (y poner el autor), y empezar con 6–8, no todas.

## 3. Subtítulos

- **[JASSUB](https://www.npmjs.com/package/jassub)**: dibuja subtítulos ASS/SSA con libass en WebAssembly + WebGL, fuentes TTF/OTF/WOFF, puede dibujar en un canvas con tiempo manual (útil para exportar) [V]. Soporta Safari 17+ (16.2+ con ajustes) [V]. **Licencia: no estaba en lo que leí [NV]** (libass es ISC según mi memoria, **no verificado**).
- **Alternativa sin dependencia:** dibujar el texto nosotros en canvas (ya lo hacemos con `add_text`) y leer SRT. Para estilo «palabra resaltada» basta con tiempos por palabra de la transcripción.
- Falta tu decisión sobre transcripción (Whisper en el navegador, ver `RESOURCES.md` §2).

## 4. Audio

- **RNNoise** (reducción de ruido con red neuronal muy pequeña): hay puertos a WebAssembly, p. ej. [jivers/rnnoise-wasm](https://github.com/jivers/rnnoise-wasm), pero es un **fork de demostración sin licencia visible, 0 ★ [V]**: no sirve como dependencia. La fuente original es [xiph/rnnoise](https://github.com/xiph/rnnoise); **no pude leer su licencia aquí [NV]**. Limitación conocida: sufre con ruidos no estacionarios; DeepFilterNet suena mejor pero **su licencia y tamaño [NV]**.
- **Encaje:** «Quitar ruido» sería un efecto de audio por clip (nueva operación, mismo aviso de contrato).

## 5. Recorte de personas / fondo

- **[MediaPipe Image Segmenter (web)](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js)**: segmenta imagen o cada cuadro de video; ejemplos de código Apache-2.0, texto CC-BY-4.0 [V]. Avisa que bloquea el hilo principal y recomienda un *worker* [V]. **Licencia de cada modelo, tamaños y soporte en iPhone: [NV]**.
- **Encaje:** «Quitar fondo» / «persona sobre otro video» (capas). Es una función grande; para después.

## 6. Pegatinas animadas

- **[dotLottie web](https://jsr.io/@lottiefiles/dotlottie-web)**: reproductor oficial de LottieFiles, **MIT** [V], motor WebAssembly de ~500 KB comprimido, pide Canvas 2D; mínimos listados: Safari 11+ [V]. Formato `.lottie` (ZIP) [V].
- **Pendiente:** las animaciones que se descargan tienen **licencias propias, una por una [NV]**; solo usaríamos las de licencia abierta. Exportarlas dentro del video requeriría dibujarlas cuadro a cuadro en nuestro exportador.

## 7. Material gratis (para la «biblioteca de material» pendiente)

| Fuente | Qué dice [V] | Ojo |
| --- | --- | --- |
| [Pexels API](https://pexels.com/api/documentation/) | Gratis. Búsqueda de **videos** (`/v1/videos/search`). 200 pedidos/hora y 20 000/mes (más, si lo piden). **Enlace visible a Pexels** en cada uso; dar crédito al autor cuando se pueda | Prohíbe «copiar o replicar la función principal de Pexels». Un buscador de stock dentro del editor puede rozar eso: **hay que consultarlo con ellos antes** |
| [Licencia Pixabay](https://pixabay.com/service/license/) | Uso gratis, sin atribución obligatoria, se puede modificar | No se puede redistribuir «tal cual» (standalone); marcas visibles sin uso comercial. **Música, video y API: la página no lo cubre [NV]**; manda el texto de los Términos |
| Freesound (efectos de sonido) | **[NV]** no pude leer su FAQ. Sé que mezcla licencias (CC0, CC-BY, y algunas no comerciales), así que habría que filtrar por licencia | Verificar antes |

Todas las claves y llamadas serían del usuario o del navegador; **nunca claves en el repositorio**.

## Orden que sugiero (tú decides)
1. **Ideas de Timeline Studio** para el motor de operaciones (simulación previa, IDs idempotentes, diff): barato y no cambia lo que ve el usuario.
2. **Transiciones** con unas pocas de GL Transitions (verificando licencia de cada una).
3. **Subtítulos** (cuando decidas la transcripción).
4. Quitar ruido, quitar fondo y pegatinas animadas: más adelante.
5. Material gratis: solo con licencias verificadas.

— Claude
