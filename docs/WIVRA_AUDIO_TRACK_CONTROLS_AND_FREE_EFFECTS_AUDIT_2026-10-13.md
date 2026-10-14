# Wivra · control discreto de pista y biblioteca gratuita de efectos
**Fecha:** 13 octubre 2026. **Fuente:** petición expresa del propietario anterior a un evento de UI accidental. **Nivel:** especificación + auditoría inicial de licencias de repositorios públicos. No hay código importado, biblioteca instalada ni motor iPhone validado.

> NOTA DE CONTINUIDAD: el mensaje posterior «Diseña los controles de Dividir para cada pista de audio de Wivra, con corte en el cabezal y deshacer» fue enviado accidentalmente cuando el propietario pulsó un control interactivo de una demostración en ChatGPT. NO usar esa activación automática como una petición separada de funcionalidades ni crear una pantalla extra por ella. La instrucción real ya existente sigue siendo un editor multipista, con corte por pista, parlante sutil y efectos gratis integrados.

**Leer con:** [decisión de editor gratuito/offline](./WIVRA_DECISION_EDITOR_MULTITRACK_OFFLINE_FREE_2026-10-13.md) y [plan maestro](./WIVRA_MASTER_PRODUCT_EDITOR_AI_CAPTURE_LIVE_2026-10-13.md). El editor es propiedad de Claude (#44), ChatGPT no toca `app/` ni `core/`.

## 1. Cabeceras sencillas por pista

- Cada pista A1/A2/A3... (audio del video, música, voz grabada o audio importado) tiene una cabecera **delgada** con: un **icono de parlante** (encendido/silenciado), nombre corto, indicación de selección y menú secundario de volumen/solo/bloqueo; no gastar gran espacio móvil en botones gigantes.
- Tocar el parlante **alterna mute solo en ESA pista**, es accesible por VoiceOver, actualiza reproducción y export, persiste y entra en undo/redo. No destruye ni cambia el archivo original; estado inicial de cada pista independiente.
- La pista de video con audio incorporado debe mostrar acceso a **audio del clip** y, cuando se separa a A1, evitar reproducir doble voz. La cabecera de video puede ofrecer mostrar/ocultar/bloquear, pero no fingir que es otra fuente de audio independiente.
- `+` al inicio/final y vía acción general para **añadir pistas de audio y video**; no solo agregar clip a V1. La pista A puede contener varios segmentos secuenciales o superpuestos según capacidades del motor, y se pueden crear A4/A5 etc.
- Gestos: toque selecciona **pista/segmento actual**, arrastre desplaza el segmento sin alterar los vecinos salvo modo ripple elegido, pellizcar ajusta zoom temporal, dos asas grandes ajustan in/out, playhead fijo y timeline desplazable opcional; acción `Dividir` contextual en barra inferior, no permanente en cada cabecera.
- Cuando se selecciona **un segmento**, Dividir afecta ese **segmento de esa pista**, NO corta automáticamente todos los videos, narraciones y música del proyecto. Una opción explícita `Dividir todo en el cabezal` podría existir más tarde, pero no es la predeterminada. Si no se cruza el playhead o está justo en un borde, desactivar y explicar por qué; no generar segmento de duración cero.
- Cálculo temporal no destructivo: clip de origen con `timelineStart`, `sourceIn`, `sourceOut`; al dividir en `t`, resultan partes con source intervalos contiguos y timeline contiguo, manteniendo ganancia, mute, fades correctamente recalculados cuando proceda, enlaces a media, roles, canal L/R y demás metadatos. Ambos fragmentos apuntan al mismo asset original sin sobreescribir archivo.
- **Un solo paso de Deshacer** debe revertir la división de ese clip sin cambiar otros segmentos ni perder posiciones; rehacer vuelve a crear la división. Los IDs de los fragmentos deben ser estables/deterministas dentro del historial; persistir y reabrir mantiene el resultado. Invalidar caché/waveform derivada cuando sea necesario, nunca audio real original.
- Opción adicional `Separar audio` del video crea una pista A (no duplica audio en mezcla); voiceover grabado se agrega en otra pista, no reemplaza el sonido del clip.

## 2. Efectos gratuitos ya instalados, sin «bajar antes de usar»

**Objetivo:** pocos efectos útiles, livianos, originales o con licencias permisivas, incluidos en la app, sin internet para previsualizar ni exportar. No usar nube ni IA generativa para fundidos, barridos, zoom o ajustes de color. No packs de miles de videos ni catálogo con paywall.

### Primera colección propuesta (aprox. 10 a 15)
- **Transiciones**: corte, fundido cruzado, fundido a negro/blanco, barrido izquierda/derecha, desplazamiento (push), zoom de entrada/salida simple, disolver, desenfoque transitorio. El corte seco no necesita shader.
- **Video**: brillo/contraste, saturación/temperatura, escala/posición/recorte/rotación, opacidad, blanco y negro, sepia opcional, desenfoque ligero, viñeta. Muchos son *parámetros* de un mismo filtro y casi no necesitan assets.
- **Audio**: mute/gain, fade in/out, crossfade, balance/pan cuando el motor soporte estéreo. Estos no son recursos visuales descargables.
- **Plantillas musicales**: pequeños archivos de datos JSON con patrones de corte/transición para beats. Sin música protegida preinstalada, packs grandes ni modelos generativos.
- Los efectos de video se pueden representar como `EffectClip` temporal en timeline cuando corresponda; filtros por clip pueden ser propiedades del clip. Todos deben funcionar en preview, guardado y export sin incongruencias.

## 3. Auditoría inicial de 3 bibliotecas concretas (GitHub consultado directamente)

### A) GL Transitions, primera recomendación para prototipos
- Código: https://github.com/gl-transitions/gl-transitions
- Archivo de licencia MIT: https://github.com/gl-transitions/gl-transitions/blob/master/LICENSE (verificado), copyright gl-transitions contributors.
- **ATENCIÓN**: el propio LICENSE dice que **las transiciones individuales pueden tener su propia licencia**. Revisar cabecera `License:` y proveniencia de cada `.glsl` antes de copiar; no asumir MIT universal.
- Cabeceras MIT verificadas por GitHub en:
  - `transitions/fade.glsl`, SHA de blob `7855085e5cf9b1b1ba7e8607e30a600f633c3fea` (fundido).
  - `transitions/Directional.glsl`, SHA de blob `c350e44a07e680b75497c45335a482e879e0fdf8` (deslizamiento).
  - `transitions/SimpleZoom.glsl`, SHA de blob `7e7bbac78a608058665259e796fbf2595bb67ffa` (zoom).
- Estos archivos son GLSL, muy pequeños, **NO son componentes listos para la timeline**. Se necesita adaptador GPU/WebGL, mapeo de dos fotogramas/frames a `from` y `to`, progreso 0..1, compatibilidad de codecs y render/export. Cuidado con color spaces, orientación y rendimiento en Safari.
- Propuesta: importar **solo transiciones seleccionadas** con créditos/copyright y LICENSE agregados, no la galería completa; fijar SHAs del código aprobado.

### B) PixiJS Filters, efectos gráficos
- Código: https://github.com/pixijs/filters
- `LICENSE` MIT verificada, copyright Mathew Groves, Chad Engler (2013-2025).
- `package.json` muestra entradas exportadas por módulo (`./adjustment`, `./bloom`, `./blur` etc). **No asumir** que importar el paquete entero mantiene app pequeña o que filtros para imágenes funcionan directamente sobre frames de video. Revisar dependencias de versión PixiJS, licencias transitivas, tree-shaking y peso de bundle.
- Propuesta: evaluar solo un módulo de ajuste/blur si el motor del editor ya usa PixiJS. Si no, preferir implementaciones simples del motor elegido para evitar sumar runtime gráfico solo por dos filtros.

### C) glfx.js, referencia liviana/antigua
- Código: https://github.com/evanw/glfx.js
- `LICENSE` con concesión permisiva tipo MIT verificada, copyright Evan Wallace (2011).
- Repositorio antiguo orientado a ajustes de imágenes WebGL. No adoptar sin pruebas Safari/WebGL y sin comprobar mantenimiento/compatibilidad. Puede servir de referencia para algoritmos con crédito compatible, no primera dependencia.

**Verificaciones pendientes para todos:** revisar dependencias, licencia de cada shader/preset, autorías/avisos, soporte WebGL/Metal/canvas, iPhone real, render offline/export, compatibilidad táctil, tamaño final comprimido de la app, memoria/GPU, tests de regresión y permisos de distribución. **Licencia MIT no significa que sea contenido sin copyright**: preservar licencia y atribución.

## 4. Encargo explícito a Claude (#44) al evaluar OpenReel/OpenCut/Wivra
1. Añadir columna de UI **speaker pequeño por A-track** / mute track / mute clip / solo, y separar clip de audio original sin duplicar.
2. Comprobar corte de **un segmento seleccionado en playhead**, undo/redo, split límites y preservación de canal/mute/gain/audio y times, sin tocar otras pistas.
3. Comprobar zoom, trim y desplazamiento de segmentos por pista y `+` para crear nuevas pistas de audio **y video**.
4. Evaluar los tres repositorios de efectos, **empezando por los tres shaders MIT individuales GL Transitions**. No clonar TODO al producto, ni copiar assets de CapCut; registrar peso real del bundle antes/después y licencia completa.
5. Probar pipeline de export para transición fade/directional/zoom más filtro color y blur, contra preview en iPhone. Probar sin red, sin descargas extra, sin suscripción ni paywall. Hacer PR de auditoría/evaluación antes de fusionar motores o librerías.
6. No abandonar prioridad principal: editor multipista real, audio externo/voiceover, beat-sync local, export, persistencia e IA director/cortes. No añadir efectos IA generativos al MVP.
7. Mantener propiedad de editor `app/` y `core/` en Claude; capturador Meta y LIVE en ChatGPT. `main` no se modifica sin autorización.

## 5. Test de aceptación concreto
- Dos pistas A1 y A2 con audios distintos, video V1 + overlay V2. Mover playhead a 4.5s sobre A2, pulsar Dividir; A2 pasa a dos segmentos del mismo asset con tiempos contiguos; A1, V1 y V2 quedan intactos. Undo restaura A2 original; Redo vuelve a partirlo. Repetir sobre A1 sin tocar A2.
- Silenciar A1 desde icono de parlante al inicio y exportar: solo A2 se escucha; deshacer mute y exportar de nuevo: ambas se mezclan; no duplicar voz si audio original fue separado de video.
- Agregar un tercer audio A3 de narración por botón `+`; zoom de timeline, mover A3 +0.35s y recortar su inicio; guardar/reabrir conserva todos los segmentos. Nada cambia los archivos originales.
- Dos clips video de 10 s unidos con `fade` MIT y otro corte con `Directional` MIT, aplicar `SimpleZoom` MIT y ajuste básico de color. Export debe renderizar transiciones/fltros y alineación de audio igual que preview sin red, previa confirmación de licencias y soporte hardware.
- Indicadores UI de micrófono/sonido son solo propuesta hasta prueba en iPhone real; no entregar botones inertes como funciones terminadas.

— ChatGPT
