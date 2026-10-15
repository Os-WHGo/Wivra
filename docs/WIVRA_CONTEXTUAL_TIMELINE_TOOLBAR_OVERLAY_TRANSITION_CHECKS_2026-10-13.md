# Wivra · Barra contextual por pista y detección de superposiciones durante transiciones

**Fecha de registro:** 13 octubre 2026. **Decisión del propietario:** barra inferior de comandos dependiente del tipo de pista/clip seleccionado, e interacción asistida cuando una superposición de video cruza la unión/transición de dos tomas de la pista principal. **Estado:** especificación UX y pruebas; no funcionalidad ya construida. Fuente: últimas dos capturas CapCut y aclaración directa del propietario, sin redistribuir capturas ni copiar activos de marca.

## 1. Referencia observada de CapCut

En la primera captura, una edición de clip tiene abierta una **hoja inferior "Volumen"** con deslizador y controles adicionales de reducción de ruido/equilibrio, algunos marcados como Pro. En la segunda, el clip de video está seleccionado con **borde turquesa**, timeline con fotogramas, y la **barra inferior contextual** exhibe `Dividir / Volumen / Animaciones / Efectos / Eliminar / Velocidad`. Un bloque morado de efecto se ve superpuesto temporalmente a la escena en una pista inferior. Las dos capturas son evidencia visual de **UI ajena**, no de resultados probados ni obligación de calcar iconos, colores, rango 0–1000 o paywalls.

La intención **no** es imitar la interfaz exacta, sino seguir el patrón táctil: **selección determina herramientas** y los parámetros aparecen en una hoja de control compacta, con salida fácil al contexto general.

## 2. Barra contextual única, no un menú fijo para todos

| Selección | Barra priorizada para Wivra | Panel secundario o extras |
|---|---|---|
| Nada seleccionado | Añadir Video, Añadir Audio, Grabar Voz, Texto/Subtítulos, Efectos, Director IA, Exportar | Vista general de proyecto, búsqueda de herramientas |
| Clip video V1/V2/V3... | **Dividir**, Recortar, Duplicar, Velocidad, Volumen* , Transiciones*, Superposición, Filtros, Eliminar | Opacidad, máscara, posición/tamaño, transformar, animaciones/fundido, reemplazar, enlace audio-video; *) mostrar volumen solo si el clip posee audio embebido, transiciones solo en límites válidos |
| Segmento audio A1/A2/A3... | **Dividir**, Recortar, Duplicar, **Volumen**, Silenciar, Fundido entrada/salida, Mover/Desfase, Sincronizar, Eliminar | Separar/volver a enlazar con video, solo, normalización básica si existe realmente |
| Pista audio (cabecera) | Parlante sutil (mute de pista), nombre, más opciones, seleccionar pista | Bloquear/solo/ocultar forma de onda; **Dividir** requiere un segmento seleccionado, no corta toda la pista por error |
| Texto / subtítulo | Editar contenido, Duración, Estilo, Posición, Duplicar, Eliminar | Fuente, color, contorno, idioma y alineación cuando existan |
| Clip de efecto/transición | Ajustar, Duración, Mover, Duplicar, Sustituir, Eliminar | Orden de capas, opacidad/fuerza, keyframes si motor soporta, previsualizar |

**Reglas UI:** priorizar `Dividir` en primer espacio tras selección de segmento A/V; barra horizontal scrollable con buen tamaño táctil, accesibilidad VoiceOver y etiquetas legibles; mantener playhead y zoom; acción de Deshacer/Rehacer siempre localizable, no escondida por subpaneles. Botones no implementados deben aparecer como pendiente/ocultos, nunca fingir acción ejecutada. El panel Volumen se abre sobre el editor con un control de ganancia real (unidad legible, `0%=silencio`, `100%=original`, niveles superiores solo si motor/limitadores soportan sin clipping) y mute independiente; no copiar escala propietaria de CapCut. Una pista silenciada se representa con icono `volume-x` y persistencia, no se borra archivo.

**Split por pista:** sobre un segmento seleccionado `S` que contenga tiempo de playhead `t`, `Split(S,t)` modifica solo ese segmento, conserva referencias originales, fades/gain y sincronización de canal, genera segmentos contiguos, guarda operación en history. Si playhead fuera del intervalo, no dividir; no cortar globalmente todas las pistas excepto comando explícito de usuario. Deshacer con una acción restaura original y redo repite división.

## 3. Caso nuevo: un overlay atraviesa un corte o una transición del video de fondo

**Ejemplo concreto:** `V1` contiene `Toma A [0,10)` y `Toma B [10,20)`, con una transición `crossfade` cerca de `t=10` (ventana real según modelo del compositor). `V2` contiene `Superposición P [8,13)` con opacidad no nula. Por diseño, V2 continúa visible mientras V1 cambia bajo ella. Puede ser **intencional** o puede ocultar la transición y verse abrupto. **No inferir automáticamente que es un error.**

### Detector propuesto (cuando el usuario agrega/ajusta transición o mueve/rescala V2)

1. Identificar límites de transición/cortes REALES de tracks de fondo; para transición usar intervalo render efectivo `transitionWindow=[t0,t1)` en tiempo de proyecto, no asumir duración ni que siempre se centra en corte; para cut seco puede usar una zona de tolerancia visual basada en frames configurable.
2. Buscar clips de tracks visualmente **superiores** cuyo intervalo temporal intersecta `[t0,t1)`. Corregir offsets, velocidad y clips anidados según modelo del motor. Clips V3+ incluidos.
3. Si existe intersección visual posible (overlay visible/no oculto; alpha>0 durante parte del intervalo; región que ocupa el marco) informar con un **aviso no bloqueante, una vez por cambio**. No alertar por audios, overlays ocultos, clips de otra escena, opacidad cero. Detección geométrica avanzada de si "tapa" la transición es opcional: el MVP puede usar intersección temporal + estado visible y decir **«podría afectar»**, no «lo arruina».
4. No abrir aviso repetitivo durante scrub; activar en operaciones finalizadas (soltar drag, confirmar transición) y permitir «No avisar de nuevo en este proyecto».

### Mensaje orientativo, sin imposición

> «La superposición **V2 · Clip superpuesto** continúa durante la transición entre **Toma A → Toma B**. ¿Quieres mantenerla visible o ajustarla?»

Acciones ofrecidas como operaciones de editor normales, previsualizables y reversibles:

- **Mantener superposición (predeterminada):** ninguna modificación. El contenido V2 permanece continuo, ideal si se desea PIP permanente.
- **Terminar antes de la transición:** ajustar final visible de overlay a `t0`; conservar el material fuente. Útil si no debe cubrir fundido.
- **Ocultar durante la transición y reaparecer después:** recortar/fragmentar/segmentar visualmente V2 en `[start,t0)` y `[t1,end)`; dejar **hueco visible** `[t0,t1)` con el original intacto. Debe conservar continuidad correcta del `sourceIn/sourceOut`: el segundo fragmento retoma material desde el tiempo de fuente que correspondería a `t1`, sin retroceder o saltar involuntariamente.
- **Fundir la superposición al salir/entrar:** keyframes/preset de opacidad en V2: salida hacia `t0`, regreso después de `t1`, duración ajustable; si no hay keyframes en el motor, avisar y no presentar opción como disponible.
- **Dividir V2 en el límite:** split independiente en `t` con dos segmentos contiguos; **importante, dividir solo NO oculta V2**, por lo que esta acción no se presenta como reparación automática de la visibilidad durante transición. Solo ofrece cortes para edición manual.

**No** sugerir «arreglar la transición» moviendo V1 sin permiso, ni introducir hueco al video principal, ni alterar el audio de overlay involuntariamente. Si el clip V2 tiene audio propio, distinguir entre **ocultar solo video** y **silenciar audio en el hueco**, consultando o usando comportamiento documentado para segmentos enlazados; el usuario debe poder previsualizar resultado de ambas opciones.

### Esquema no destructivo / history
- Las operaciones de recorte/hueco/fade se implementan como timeline segments, visibility/opacity automation o masks. Se conserva el archivo multimedia original. Capturar cambio compuesto (p.ej., split + gap + fades) como UNA transacción única de undo/redo.
- Preservar referencias `mediaAssetId`, `sourceIn/sourceOut`, track ID, z-order, `startSeconds/endSeconds`, audio-link, y transforms, especialmente al partir V2 en dos segmentos.
- Los cambios aparecen igual en **preview y export**; efectos de transición se aplican a ambas tomas de fondo con compositor real, no únicamente en CSS de preview.
- No avisar como problema fatal y no modificar nada sin confirmación explícita. IA Director puede emitir sugerencia análoga, **no ejecutar corte destructivo ni aplicar silenciosamente**.

## 4. Casos de aceptación de Claude y del motor elegido

**Prueba A: barra contextual de audio/video**
- Seleccionar V1: barra muestra Dividir, Recortar, Duplicar, Velocidad, efectos/video; botón Volumen solo si V1 tiene audio.
- Seleccionar A2 (voz externa): aparecen Dividir, Recortar, Volumen, Silenciar, Mover, Fundidos; no mostrar Filtros de imagen. Cambiar volumen de A2 y mutear A1 desde pequeño parlante: preview/export correctos y cambios reversibles. Seleccionar texto y efecto: barras específicas; al deseleccionar, volver a barra general.
- Split A2 en `t=4.5s`: solo A2 se divide, ninguna otra pista; guardar/rehidratar y undo/redo.

**Prueba B: overlay atraviesa transición**
- V1 dos tomas A/B con crossfade definido sobre intervalo `[9.5,10.5)`; V2 overlay `[8,13)` y alpha 1.
- Al aplicar/modificar crossfade, ofrecer aviso NO bloqueante; elegir `Mantener` deja V2 intacto. Intentar una segunda vez sin cambios no inunda con alertas.
- Elegir `Ocultar durante`: V2 visible 8–9.5, invisible 9.5–10.5, visible 10.5–13; conservar desplazamiento fuente y audio según selección; export coincide con preview. Undo recupera V2 [8,13), redo restaura hueco.
- Elegir `Terminar antes`: V2 acaba en 9.5. `Fundido` ajusta alpha temporal si motor lo soporta.
- Al mover V2 fuera del intervalo [9.5,10.5) no avisar; si V2 invisible/alpha=0 durante la transición, no avisar; con múltiples overlays, listar afectados.
- Probar otro tipo de transición/desplazamientos de tiempo, cortes con 0 duración, clip V2 con sonido enlazado, V3, tres clips de fondo y ratio vertical 9:16 en iPhone real.

**Prueba C: sin edición disfrazada de IA**
- Todos los avisos/ajustes anteriores se calculan en **lógica local determinista**, sin conexión ni pagos. No necesitan IA ni proveedor externo. La IA director puede elegir sugerirlos luego mediante operaciones validadas; sin nube para mover/cortar pistas.

## 5. Implementación/reparto
- **Claude (#44)**: UI contextual y compositor multicapa, detector de intersecciones V1-VN, previews, historial undo, export, persistencia y pruebas de iPhone. Comparar capacidades al evaluar OpenReel/OpenCut/Wivra, antes de reemplazar editor actual.
- **ChatGPT**: fuentes de cámara/micrófonos Meta/USB y LIVE en ramas separadas. No tocar editor `app/` / `core/`.
- **Meta AI**: investigación de Meta SDK, no UI del editor por defecto.
- **Usuario**: decide cuándo aprobar motor/merge. **No fusionar a main ni afirmar que este comportamiento ya está implementado.**

**Referencias internas:** [Plan maestro](./WIVRA_MASTER_PRODUCT_EDITOR_AI_CAPTURE_LIVE_2026-10-13.md) · [Decisión editor offline](./WIVRA_DECISION_EDITOR_MULTITRACK_OFFLINE_FREE_2026-10-13.md) · [Controles audio](./WIVRA_AUDIO_TRACK_CONTROLS_AND_FREE_EFFECTS_AUDIT_2026-10-13.md). Las capturas de CapCut permanecen en la conversación, NO se han transferido a GitHub.

— ChatGPT


## 6. NUEVA DECISIÓN: alcance de filtros/transiciones y fundidos con superposición acotada

**Aclaración expresa del propietario (octubre de 2026):** al seleccionar una pista/clip, ofrecer aplicación de filtro/efecto a la pieza seleccionada **o a todas las capas visibles**, y permitir aplicar transiciones individualmente o a todos los cortes compatibles. Los fundidos entre videos deben limitarse al intervalo de transición definido; **dos videos superpuestos libremente/translúcidos durante más tiempo son otro modo y requieren intención explícita**. El editor debe ofrecer controles para elegir tipo y duración de transición, sin extender accidentalmente clips ni aplicar efectos sobre material ajeno.

### 6.1 Alcance visible en un panel, sin confundir clip, escena y composición
Opciones de alcance:

| Selección | Interpretación real | Efecto en composición |
|---|---|---|
| `selected_clip` (predeterminada cuando selecciono clip) | Solo video V1/V2/etc. elegido, intervalo del clip | Efecto previo a componer capas, no altera V2+ ni los vecinos |
| `selected_track` | Todos los segmentos de esa pista en intervalo solicitado | Configuración/preset sobre una pista, sin afectar el resto |
| `scene_composite` | Todas las capas VISIBLES que conforman una escena/intervalo definido entre cortes en video base o rango seleccionado | Aplicar efecto a imagen final compuesta de la escena; mantiene relaciones entre capas |
| `time_range_composite` | Todas las capas visibles entre `t0,t1`, sin reconfigurar clips individualmente | Nodo global **post-composición**, con orden de render claro; sin multiplicar el efecto sobre cada fuente |
| `all_compatible_cuts` | Para transiciones: replicar el preset sobre cortes compatibles de la pista/escenas seleccionadas | Solo lugares técnicamente válidos, preview de cuántas uniones serán afectadas y undo agrupado |

**No aplicar cualquier transición "a todas las capas" como si cada pista tuviera el mismo corte.** Para un corte de escena completa con V1+V2+, proporcionar `transitionScope = base_track` (solo transición entre tomas V1, overlays persisten) o `transitionScope = scene_composite` (transición entre **dos composiciones** a izquierda y derecha, con decisión explícita de qué overlays entran en cada una). Las capas que cruzan el corte pueden permanecer estables mientras se mezclan escenas, o entrar en la transición si el usuario lo elige. Mostrar previsualización para evitar parpadeos, duplicación aparente o cambios inesperados de transparencia.

### 6.2 Selección de transiciones y límites
- Al tocar **la unión real entre dos clips** (o elegir dos clips contiguos): menú `Tipo de transición`, `Duración`, `Alcance`, `Reproducir preview`, `Aplicar a todos los cortes compatibles` (acción separada, con confirmación de número).
- Predeterminado: `cut` (sin mezcla) cuando no haya transición; al elegir `crossfade` o similar se genera un **intervalo finito** `[start,end)`. Duración configurable por usuario, con valor inicial breve por decidir en UI y **capada por la disponibilidad real de fotogramas** a ambos lados (`handles`, velocidad del clip, y estructura de timeline). No ampliar solapamiento fuera de ventana ni mover otras pistas silenciosamente. Si falta margen de material o no cabe, reducir con aviso explícito o deshabilitar alternativa, jamás congelar frame/hacer loop de forma oculta.
- Un crossfade significa que ambas tomas se muestrean/mezclan SOLO durante la ventana elegida, `alphaA = 1 - progress`, `alphaB = progress` (según pipeline gamma/color/alpha correcto); fuera de la ventana, solo A o B. En un punto de corte sin handles disponibles, no puede fingirse una disolución usando fotogramas ajenos; ofrecer reducir duración o corte limpio.
- Video base V1 no debe extenderse inexplicablemente, crear saltos o dejar negros. El cálculo de tiempo de proyecto/salida y deslizamiento de clips debe ser explícito al usuario si el motor precisa consumir tiempo. **Preferir transición que preserve duración global** mediante manejo claro de handles, siempre que sea posible.
- Los filtros/efectos temporales se pueden asignar a cada clip o a la composición global; el usuario define duración e intensidad; efecto de escena puede guardarse como layer/adjustment track sobre las capas sin afectar archivos originales.

### 6.3 Superposición explícita vs fundido entre clips
- **Modo Transición (predeterminado):** dos tomas se combinan ópticamente durante ventana limitada, sin crear por defecto una pista V2 persistente para la toma entrante. UI muestra tramo de unión (p.ej. símbolo entre clips) y su duración.
- **Modo Superposición (opt-in):** usuario coloca V2 sobre V1 deliberadamente, indica inicio/fin, tamaño/transformación y opacidad/curvas/alpha independientes. Aquí pueden verse ambas tomas simultáneamente durante minutos si el usuario lo quiere; no confundir con crossfade automático.
- Si un V2 ya existente atraviesa la transición V1: conservar las opciones anteriores **Mantener / Terminar antes / Ocultar y reaparecer / Fade V2**, con aviso no bloqueante. La elección de `scene_composite` debe solicitar una vista previa y evitar que un overlay persistente entre por duplicado en las dos composiciones.
- Si usuario aplica un filtro "a todas las capas" y existe una superposición, renderizar **una sola vez sobre salida combinada** cuando se eligió `time_range_composite` o `scene_composite`, respetando máscaras, alpha y orden de efectos.

### 6.4 Casos de aceptación (motor + UX de Claude)
1. `V1:A 0–10s → B 10–20s`, `V2:P 8–13s`. Aplicar filtro a A solo: V2 sin color alterado. Aplicar a escena [8,13): V1+V2 muestran filtro uniforme, preview = export.
2. Elegir transición crossfade en corte V1 a t=10 con duración 0.4s y handles adecuados: solo se ve mezcla A+B en ventana de 0.4s; nunca se duplica V1 como overlay indefinido. Usar deslizamiento y otro preset, verificar duración, audio, composición y export.
3. Falta de fotogramas de margen: motor no introduce fotogramas congelados/negros ocultamente; UI ofrece duración válida o corte limpio, explicación clara y undo.
4. Elegir `scene_composite` con V2 que cruza t=10: poder mantener V2 continuo o incluirlo en cambio de escena; no oscurecerlo dos veces ni duplicarlo. Aviso de intersección no bloqueante. Undo/redo restaura capa y transición.
5. Elegir `all_compatible_cuts`: muestra cantidad de uniones y rangos compatibles; aplica solo válidos, indica omitidos y deshace todos los cambios como una sola acción. Edición manual posterior por unión sigue permitida.
6. Crear manualmente dos videos superpuestos V1+V2 por 5s con opacidad V2 35%: **no es una transición** ni tiene límite artificial de 0.5s. Mantener V2 sólo durante ese intervalo y reflejar opacidad real en export.
7. Todo trabaja offline para clips/filtros/transiciones incluidos, se guarda y recupera proyecto, conserva originales y puede editarse sin IA. Probar realmente en iPhone y con clips HEVC/MOV, no dar por validado por una pantalla de ejemplo.

### 6.5 Investigación externa sobre efectos y filtros
Se revisó una investigación externa que propone Core Image, Harbeth MIT, shader GLSL y packs opcionales. **Hallazgos que sí pudieron verificarse mediante GitHub:** `yangKJ/Harbeth` existe y tiene licencia MIT. **Cifras no verificadas:** 300 efectos locales listos, 1000+ transiciones, estimaciones en MB/4K FPS, facilidad de portar GLSL→Metal y peso total de la app. La fuente `wess/Free-LUTs` citada **no se localizó** bajo ese nombre (404 en GitHub), por lo que NO incluir ningún LUT de ese supuesto repo. iOS Core Image/Harbeth no son automáticamente plug-ins del actual editor web de Claude y su integración debe esperar selección de motor y prueba de export. No adoptar estimaciones o recomendaciones como requisitos.

**Prioridad:** primero funcionalidad real del motor multipista y export en iPhone, después controles de efectos y transiciones con alcance, siempre gratis, ligeros y offline. Claude conserva propiedad de `app/`/`core/`, ChatGPT no implementa el editor en su rama. Ningún merge a `main` sin aprobación.

