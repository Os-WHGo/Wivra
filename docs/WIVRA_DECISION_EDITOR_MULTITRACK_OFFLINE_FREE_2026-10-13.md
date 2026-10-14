# Wivra · decisión vinculante de alcance: editor MULTIPISTA, gratuito y offline-first
**Fecha de registro:** 13 oct 2026 (local); continuidad de las capturas y conversaciones sobre CapCut de la misma fecha.
**Origen:** aclaración explícita del propietario. **Prioridad sobre propuestas anteriores** de IA generativa, miles de efectos descargables, «mercado de plantillas» o módulos de pago.
**Nivel actual:** especificación funcional y criterios de aceptación. NO implica que el editor, grabación de voiceover, sincronía musical u offline ya estén implementados o validados en Safari/iPhone.

## 1. Objetivo principal
**Wivra = editor de video verdaderamente completo y táctil, con múltiples pistas de video, audio, texto y efectos; funcionamiento gratuito para el usuario; edición básica realizable desde el propio teléfono sin depender de un servicio de red.** Diferenciador IA: director/observación del material real, búsqueda de tomas útiles y montaje/cortes automáticos revisables. La IA no necesita generar videos ni miles de efectos sintéticos para que la app sea competitiva.

**Importante:**
- "Editor completo" no equivale a "tiene muchos iconos"; exige motor de reproducción, mezcla, composición, persistencia y export.
- "Offline-first" aplica a edición, efectos integrados, grabación local y proyecto. Servicios remotos voluntarios (transmisión LIVE, IA basada en nube, descarga legítima por URL, proveedores de transcripción/traducción cuando sean necesarios) sí requieren internet.
- **Gratuito**: funciones básicas y efectos integrados sin planes premium, monedas, créditos ni paywall. Si se incorpora servicio externo con coste inevitable, no usarlo a escondidas ni presentarlo como gratuito; buscar alternativa local/abierta o exigir consentimiento/presupuesto explícito del propietario. No prometer que el coste de APIs o ancho de banda externo sea cero.
- Paquete ligero al instalar: preferir efectos paramétricos implementados como código/shaders simples y presets de datos (JSON), sin cientos de videos animados o paquetes de recursos voluminosos en el binario. Inicialmente un conjunto CURADO que sí funcione offline y en export; packs adicionales gratuitos opcionales descargables solo cuando el usuario quiera, si se aprueban. No descargar automáticamente cada efecto al tocarlo.

## 2. Línea de tiempo real: requisitos no negociables
- Número de pistas de video/audio NO limitado artificialmente a 1; límites prácticos según memoria/dispositivo e información explícita al usuario. Compatibilidad vertical 9:16, horizontal 16:9 y otras relaciones.
- **Botón + por tipo de pista (Video, Audio, Texto/Caption, Efecto)** y al final o dentro de cada pista, para añadir contenido, nuevas pistas y continuar agregando elementos después del último video. No limitar el '+' global a añadir clips solo en una pista principal.
- Video V1: clip principal. V2, V3...: overlays/superposiciones, picture-in-picture, tamaño/posición, máscaras/opacity, posible pantalla dividida. Varias fuentes a la vez deben mostrarse simultáneamente si el motor lo permite, no únicamente reproducción secuencial.
- Audio A1, A2, A3...: sonido original, audio separado de cámara, archivo de audio externo, música, **voiceover grabado**. Pistas independientes, no franjas decorativas. Vista de forma de onda REAL, arrastre horizontal, corte/trim/split, gain, mute/solo, fade, desplazar offset, renombrar, quitar, vincular/desvincular con clip, deshacer.
- En modo **Voiceover**, reproducir la línea de tiempo mientras se graba micrófono seleccionado del dispositivo (según permisos y capacidad), con cuenta regresiva/monitorización segura; al detener, crear NUEVO asset y NUEVO segmento en pista editable alineado con tiempo real de reproducción. Usar auriculares para evitar feedback/eco; medir latencia y corregir desplazamiento editable, no fingir sample-perfect sin prueba. Permitir regrabar tomas sin destruir originales, fallback de voz grabada externamente si Safari no permite reproducción+captura fiable.
- Pistas de textos y subtítulos independientes, y effect clips temporizados, con las acciones que ya están documentadas en el plan maestro. Renderizar de forma coherente en preview **Y export**.
- Zoom horizontal ajustable con gesto pinch, botones +/− o slider; snap activable, scrubbing, regla temporal legible, playhead fijo opcional, visual de fotogramas y waveforms, handles táctiles grandes, scroll horizontal/vertical, selección, agrupar/bloquear/ocultar pistas si el motor lo soporta. Barra contextual cambia según tipo seleccionado.
- Persistencia: proyecto serializado con IDs y referencias a medios locales, autosave/versionado, deshacer/rehacer y reabrir desde iPhone sin pérdida de relaciones y offsets. Considerar OPFS/IndexedDB/almacenamiento nativo, límites/cuotas iOS y fallos; no prometer que archivos enormes sobrevivan a evicción de Safari sin una estrategia verificada.

## 3. Efectos GRATIS integrados y ligeros
Primera colección **con calidad suficiente, no cantidad por marketing**. Efectos básicos de composición y audio disponibles offline y sin descarga adicional:
- Imagen: exposición/brillo, contraste, saturación, temperatura, sombras/altas luces si motor lo soporta, blur, vignette, opacidad, escala/posición/rotación/crop, espejo, filtros/presets de color simples, fundidos de entrada/salida.
- Transiciones: corte, fundido cruzado, fundido a negro/blanco, wipe/deslizar y zoom simple, cada una con duración editable y prueba de export.
- Audio: gain, mute/solo, fades, crossfade, fade música debajo de voz manual, pan/mono-estéreo según motor, EQ básico si pequeño y probado.
- Efectos temporales como bloques/instancias editables en timeline, no procesamiento irreversible. Plantillas/presets **originales**, presets JSON y shaders pequeños; assets de terceros solo con derechos compatibles.
- Efectos IA generativos (borrado de personas/fondos generativo, remezcla de videos, lipsync sintético, ultra-upscale, avatar) se **despriorizan/no forman parte del MVP**. No construir un marketplace de packs/proveedor obligatorio; no copiar millones de efectos de CapCut ni cobrar por plantillas.

## 4. Sincronizar edición con música SIN IA generativa
- El usuario importa una canción/audio local con derechos de uso; Wivra analiza **onsets/transitorios/tempo/beats** por DSP local cuando sea técnicamente viable. Un algoritmo de beat detection no tiene por qué usar un modelo de IA.
- Mostrar marcadores de ritmo en la timeline: editar/añadir/eliminar beats, elegir sensibilidad y corte cada beat/cada 2/4 beats.
- **AutoCut musical:** aplicar a una selección de clips; propone cortes/transiciones y duraciones basadas en beats, usando efectos/presets integrados (p.ej. cut/fade/zoom). El resultado es un borrador editable, no reemplaza la timeline ni destruye originales; undo/redo.
- Un pack pequeño de plantillas musicales es **datos de timing/transiciones**, no videos/efectos de gigabytes ni sincronización a bibliotecas de música licenciada sin derechos. La disponibilidad de la música es aparte de la plantilla.
- Si el audio tiene ritmo ambiguo (ambient, clásico, sonidos irregulares) no prometer BPM/beat correctos; permitir tap tempo y corrección manual. Exportar con sonidos alineados y verificar sincronización del resultado.

## 5. IA: reducir alcance a lo que el propietario sí busca
- Única función de IA **prioritaria**: **asistente/director de edición**, que entienda el material disponible (análisis real de fotogramas/audio/transcripciones cuando haya permiso y capacidad), encuentre escenas, recomiende orden, haga cortes y cree un montaje de prueba mediante operaciones tipadas validadas.
- Usuario puede pedir: "haz un video de 45 segundos con mejores momentos", "quita escenas borrosas", "corta siguiendo la música" o "mantén esta parte", previsualizar y aceptar/rechazar; la edición manual permanece plena.
- La sincronización musical básica puede ser DSP determinista offline, sin IA generativa. La IA opcional puede proponer una selección de clips para ese motor, si el usuario la invoca.
- **Subtítulos automáticos** y traducción textual siguen como herramientas útiles del editor, pero no se debe forzar IA/servicio de pago. Ofrecer subtítulos manuales y SRT/VTT local como base; STT local si modelo ligero viable y probado en teléfono, o proveedor en línea opt-in con privacidad/costo claros. Los modelos grandes, dubbing y lipsync NO son prioridad y quedan congelados.
- Proveedores externos necesarios para dirigir con IA no garantizan uso sin internet. Debe existir fallback de edición manual y una opción básica de AutoCut musical sin nube.

## 6. Matriz OFFLINE/ONLINE honesta

| Acción | Objetivo sin internet en el teléfono | Requiere/red eventual |
|---|---|---|
| Importar archivo desde almacenamiento local | Sí | iCloud/galería remota si no está descargado |
| Cortar, mover, duplicar, dividir clips | Sí | No |
| Superponer video, ajustar tamaño y opacidad | Sí | No |
| Varias pistas de voz/música, mezclar/exportar | Sí | No (si formatos soportados y recursos locales) |
| Grabar narración durante edición | Sí, con permisos y soporte de iOS | No para entrada local |
| Efectos/transiciones integrados | Sí | No |
| Marcar beats y AutoCut según música local | Sí, si motor local implementado | No |
| Subtítulos manuales/importar SRT/VTT | Sí | No |
| Subtítulos transcritos automáticamente | Solo si motor STT/modelo local probado | Si usa proveedor de voz en nube |
| Director IA que analiza videos y decide cortes | Solo si modelo local suficiente/verificado; NO presumir | Servicio externo si se elige |
| Importar video desde URL | No, salvo copia ya cacheada | Red y derechos/permisos |
| Emitir LIVE a servicios remotos | No | Internet+cuenta+credenciales+dentro de políticas |
| Descargar packs opcionales gratuitos | No si no se descargaron antes | Conexión la primera vez |

## 7. Casos de aceptación que distinguen un editor completo de una demo
**Caso 1 - Voz sobre video, audio externo, export:** importar video 60s, crear A1 audio original, A2 música y A3 narración **grabada mientras se reproduce**; desplazar voiceover 0.5s, cortar a 20s, mute música 4s, seleccionar/duplicar un clip con undo/redo. Vista previa y export corresponden, sin voces duplicadas. Reabrir, verificar contenido y tracks.

**Caso 2 - 2 videos simultáneos:** V1 video de ciudad, V2 video superpuesto solo entre 5–15s, arrastrar V2, redimensionarlo y cambiar opacidad. Export lo muestra únicamente entre 5–15s. Más al final de V2 para agregar otro video y otro + para añadir V3.

**Caso 3 - Beat sync offline:** importar canción de prueba con pulsos conocidos, detectar y mostrar beats, corregir marcador, generar 8 cortes de cuatro clips sincronizados con la música y transiciones integradas. Aceptar/undo/ajustar manualmente, export, comparar cortes vs pulsos. Probar también audio sin beats claros.

**Caso 4 - Offline y tamaño:** descargar/instalar Wivra, guardar proyecto y dejar sin red (modo avión), recortar/exportar + efectos incluidos + grabar voiceover + beat-sync con archivos almacenados localmente. Medir tamaño real inicial de app (binarios/presets/modelos), RAM, batería y almacenamiento temporal, sin metas MB inventadas. No llamar funcional si falla en iPhone real/HEVC/1GB.

**Caso 5 - Efectos realistas:** aplicar 3 efectos integrados y 2 transiciones, cambiar duración, previsualizar y exportar; resultados visuales equivalentes dentro de las limitaciones del hardware, sin bajar pack alguno, y con 0 cargos.

## 8. Encargo concreto a Claude: siguiente paso
1. Leer este documento **antes** de continuar evaluación de motores del [PR #52](https://github.com/Os-WHGo/Wivra/pull/52), y actualizar la matriz OpenReel / OpenCut Classic / Wivra #44 con: **tracks arbitrarios, superposición real, pista audio+video, botón + por pista, voiceover durante preview, beat sync local, presets offline, persistencia, export iPhone, bundle size/licencias**.
2. **No implementar primero docenas de efectos IA ni pantallas de catálogo, ni depender de download por efecto.** El motor base debe procesar pistas y export; los efectos son operaciones/presets integrados.
3. Proponer primero un motor de timeline con tipos (video/audio/caption/effect), operaciones validadas, render/export y persistencia; comparar licencias y rendimiento. El trabajo previo de #44 no se borra ni se reemplaza sin autorización del usuario.
4. **En la evaluación** comparar un test de voiceover y beat-sync sin conectividad. Si el motor existente no lo hace, reportarlo como PENDIENTE, no dibujar un botón inerte.
5. La nueva decisión de producto **reemplaza** prioridad de generar video IA, filtros generativos, avatares/lipsync, market de plantillas y paquetes masivos. La voz del usuario, edición manual y director IA de cortes sí importan.
6. Mantener el reparto: Claude `app/` + `core/` y diseño de editor; ChatGPT DAT/Ray-Ban/cámara/audio fuente y futuro LIVE; Meta AI solo investigación. No fusionar a `main` sin el propietario.

**Fuentes adicionales:** [capas y subtítulos](./WIVRA_CAPCUT_AUTO_CAPTIONS_TRANSLATION_EFFECT_LAYERS_REFERENCE_2026-10-13.md), [audio externo y herramientas avanzadas](./WIVRA_CAPCUT_EDITOR_ADVANCED_TOOLS_AUDIO_AI_REFERENCE_2026-10-13.md), [capturas de inicio](./WIVRA_CAPCUT_MOBILE_UX_VISUAL_REFERENCES_2026-10-13.md).

— ChatGPT


## Adenda verificada: parlante por pista, división individual y librerías libres

El propietario precisó que quiere **un icono de parlante sutil al inicio de cada pista de audio**, acción Dividir contextual que **solo corta el segmento seleccionado** en el cabezal, zoom/trim/mover y undo/redo. Se auditaron fuentes concretas de efectos pequeños para funcionar **offline y gratis**, con licencias verificadas de `gl-transitions` (MIT general, **comprobar individualmente cada shader**), `pixijs/filters` (MIT) y `evanw/glfx.js` (permisiva tipo MIT). La primera evaluación debe usar `fade.glsl`, `Directional.glsl` y `SimpleZoom.glsl`, cada uno con cabecera MIT comprobada. Todo sigue pendiente de prueba real iPhone y motor de export. 

**Fuente de instrucciones y pruebas:** [WIVRA_AUDIO_TRACK_CONTROLS_AND_FREE_EFFECTS_AUDIT_2026-10-13.md](./WIVRA_AUDIO_TRACK_CONTROLS_AND_FREE_EFFECTS_AUDIT_2026-10-13.md). El mensaje que apareció al tocar un botón de demostración interactivo en ChatGPT no representa una nueva petición del usuario; esta adenda recoge únicamente sus instrucciones auténticas.


## Nueva regla de interacción de timeline (capturas adicionales)

La barra de herramientas inferior se contextualiza al seleccionar video (dividir/recortar/velocidad/filtros), audio (dividir/recortar/duplicar/ganancia/silenciar/fundidos/desfase), texto/captions o efecto; la selección afecta solo la pista/segmento correspondiente. Si un overlay V2+ atraviesa una transición V1, emitir sugerencia no bloqueante y reversible: mantener, cortar antes, ocultar y reaparecer al terminar la transición, o fade; sin modificar clips por sorpresa. La opción dividir solo corta, **no** resuelve visibilidad por sí sola. Especificación y pruebas en [WIVRA_CONTEXTUAL_TIMELINE_TOOLBAR_OVERLAY_TRANSITION_CHECKS_2026-10-13.md](./WIVRA_CONTEXTUAL_TIMELINE_TOOLBAR_OVERLAY_TRANSITION_CHECKS_2026-10-13.md).
