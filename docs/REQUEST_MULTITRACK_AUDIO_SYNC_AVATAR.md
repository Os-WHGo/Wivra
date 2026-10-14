# Pedido del propietario (13-10-2026): pistas, audio, superposición, sincronización y avatar

> Para que lo revise **ChatGPT** (y Claude). Esto es **solo una idea anotada**: nada de aquí está implementado ni probado.
> Estado de cada punto: **idea** → documentado → implementado → probado → validado en teléfono real.
> Decide el propietario. Se propone, no se impone. — Claude

## Lo que pidió (con sus palabras, ordenado)

1. **Audio original como pista aparte.** Al traer un video, que debajo del clip aparezca su pista de audio, que se pueda **activar/desactivar**.
2. **Mezclador de audio.** Una pantalla para subir/bajar **volumen** de cada pista y **ecualización**.
3. **Más pistas de video.** Para hacer cortes y usar **pantalla verde** (chroma key), etc.
4. **Superponer videos.** Elegir un video, ponerlo encima de otro y **elegir su tamaño** (y posición).
5. **Fusionar dos videos grabados al mismo tiempo** (como la función de Meta con las gafas): detectar que dos videos coinciden en **hora y lugar** y **sincronizarlos** para editarlos juntos.
6. **Avatar.** Un video con cámara que permita poner un **avatar**; y que el avatar también sirva en **transmisión en vivo**.

## Lo que hay hoy (verificado en el código)

- El proyecto tiene **una sola pista de video**; `clips` no tiene número de pista, ni volumen, ni silencio, ni posición/tamaño.
- El audio de cada clip es el del propio video; no hay control de volumen en el editor.
- La exportación (`app/export.mjs`) reproduce **un clip a la vez** en un canvas y graba con MediaRecorder + WebAudio. **No sabe mezclar pistas simultáneas.**
- Los cambios al modelo deben seguir pasando por `applyBatch` (operaciones validadas con deshacer/rehacer) y las herramientas de la IA (`edit_apply`) tendrán que conocer las nuevas operaciones.

## Opciones por punto (pros y contras; elige el propietario)

| # | Punto | Opción simple | Opción completa | Riesgo / duda |
|---|---|---|---|---|
| 1 | Audio como pista | Campo `muted` y `volume` por clip + interruptor 🔊 | Pistas de audio separadas del clip (se pueden mover/cortar aparte) | Safari: separar audio de video sin servidor requiere WebAudio; **no verificado** |
| 2 | Volumen / ecualización | Volumen por clip y por pista (GainNode) | EQ de 3 bandas (BiquadFilterNode) + pantalla de mezclador | Funciona en el navegador; **calidad y latencia en iPhone sin verificar** |
| 3 | Más pistas de video | Campo `track` (0, 1, 2…) en cada clip | Pistas con nombre, bloqueo, ocultar | Cambia el modelo y la exportación: hay que dibujar varias capas por fotograma |
| 3b | Pantalla verde | Filtro de color en canvas (por píxel) | WebGL/shader | Rendimiento en teléfono **sin verificar**; la calidad del borde es un tema aparte |
| 4 | Superponer y tamaño | `x, y, scale` por clip de pista superior | Gestos (pellizcar/arrastrar) sobre la vista previa | Edición táctil precisa es trabajo grande |
| 5 | Sincronizar dos tomas | Por **marca de tiempo del archivo** (si existe) + ajuste manual | Por **audio** (correlación cruzada de las dos pistas de sonido) | Metadatos de hora pueden faltar o ser inexactos; la correlación de audio es viable pero **no probada aquí**. La función de Meta es de su app: no se copia, se hace otra por nuestra cuenta |
| 6 | Avatar | Imagen/figura animada con el micrófono (boca) | Seguimiento de cara con modelo local (p. ej. MediaPipe) | Licencias y rendimiento: **por verificar**. Para transmisión en vivo corresponde al trabajo de ChatGPT (cámaras/streaming), usando la misma fuente de video |

## Propuesta de orden (solo sugerencia)

1. **Primero lo barato y útil:** silenciar/volumen por clip (puntos 1–2 simples). Sin cambiar mucho el modelo.
2. **Modelo de pistas** (`track`, `x`, `y`, `scale`) + exportación multicapa (puntos 3–4). Es el cambio grande: se hace con pruebas y sin romper lo anterior.
3. **Sincronización por audio** (punto 5) como herramienta aparte.
4. **Pantalla verde y avatar** (3b y 6), cuando el motor de capas ya funcione. El avatar en vivo se coordina con el trabajo de cámaras de ChatGPT (PR #41).

## Preguntas para el propietario

- ¿Cuál quieres primero: **volumen/silenciar** o **superponer videos**?
- ¿El avatar es una **figura** (dibujo/animado) o un **avatar tuyo realista**? Cambia mucho la dificultad.

## Qué debe revisar ChatGPT

- Que el contrato de fuentes de cámara (#41) pueda entregar a la vez **dos videos con hora** (punto 5) y una fuente para el avatar (punto 6).
- Licencias de cualquier pieza propuesta (chroma key, seguimiento de cara, sincronización): anotar y verificar.
