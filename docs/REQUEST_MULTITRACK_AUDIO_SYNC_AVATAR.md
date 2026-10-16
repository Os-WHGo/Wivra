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

---

## Actualización 13-10-2026 (noche) · pedidos nuevos del propietario, tras probar el audio por clip en su iPhone

El propietario confirmó que **silenciar/volumen por clip funciona** (probado por él; la exportación con el audio silenciado también). Pidió, además:

| # | Pedido | Estado |
|---|---|---|
| A | Ver la **pista de audio debajo del video** (como otros editores) con un **parlante** al lado para silenciar/activar | **Implementado y probado en navegador simulado** (pista verde bajo cada clip; tocar 🔊/🔇). Pendiente: probar en iPhone. La forma de onda real no está: hoy son barras decorativas |
| B | Debajo de las pistas, botón para **agregar otra pista** (video, audio o un segundo audio) | **Idea.** Requiere `track` en el modelo (ver tabla de arriba, punto 3) |
| C | **Grabar con el micrófono mientras edita** (locución) | **Idea.** `getUserMedia` + MediaRecorder; permiso de micrófono; crea una pista de audio nueva. Safari: sin verificar |
| D | La **IA controla y edita**; el editor manual es una opción visible con todo (Director incluido) | Ya es la dirección actual (IA propone, validador aplica; edición manual completa). Falta unificar Director + chat |
| E | **Efectos y transiciones** | **Idea.** Transición = modelo de capas/solapes entre clips + exportación; se hace después de las pistas |
| F | **Avatar y CG** (gráficos en pantalla) en edición **y** en transmisión en vivo | **Idea.** CG de edición (rótulos, logos) puede venir antes; la transmisión en vivo es del trabajo de ChatGPT: el contrato de capas debería ser el mismo |

Orden sugerido: modelo de pistas (B) → micrófono (C) → transiciones/efectos (E) → CG y avatar (F). Decide el propietario. — Claude


## Actualización 14-10-2026 (tarde) · estado de los puntos 3–4 y B
| # | Pedido | Estado |
|---|---|---|
| 3–4 / B | Más pistas, superponer videos con tamaño y posición, botón para agregar pista | **Implementado + prueba automática + navegador simulado** (modelo `overlayClips`, `add_overlay_clip`, `set_overlay`, botón ＋ Pista, controles y arrastre, exportación con capas). **No probado en iPhone.** Pantalla verde, pellizcar y rotación: no hechos |
| — | Seleccionar solo video o solo audio y quitar el audio de un tramo | **Implementado + navegador simulado.** No probado en iPhone |
| C | Grabar con el micrófono mientras edita | Sigue como **idea** |

## Actualización 14-10-2026 (noche)
| # | Pedido | Estado |
|---|---|---|
| — | Altavoz por pista, mover pistas/bloques con la mano, borrar de verdad (también solo la imagen conservando el audio) | **Implementado + navegador simulado.** No probado en iPhone |
| — | Tamaño del superpuesto con pellizco y esquina; formato del video (9:16, 1:1, 4:5, 16:9) con recorte automático | **Implementado + navegador simulado.** No probado en iPhone. En iPhone el pellizco real puede chocar con gestos de Safari: **NV** |
