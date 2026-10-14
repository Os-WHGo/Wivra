# Wivra · capturas de referencia: subtítulos bilingües y efectos como capas
**Fecha de registro:** octubre 2026. **Fuente:** siete capturas facilitadas directamente por el propietario en la conversación. **Nivel:** observaciones de UI de CapCut, no código, no autorización para copiar marcas/assets ni prueba de la calidad del procesamiento. Se mantiene la prioridad de Wivra: editor real tipo CapCut + IA que comprende los medios + captura Meta y LIVE; ver [plan maestro](./WIVRA_MASTER_PRODUCT_EDITOR_AI_CAPTURE_LIVE_2026-10-13.md).

**Privacidad y permisos:** las imágenes originales permanecen en la conversación. NO se suben al repositorio. Se describen únicamente controles y comportamientos visibles; no atribuir identidades a las personas que aparecen en el video.

## 1. Observaciones individualizadas de las 7 capturas

| Captura | Lo visible realmente | Implicación para Wivra |
|---|---|---|
| 1: subtítulos automáticos, configuración | Hoja inferior sobre editor; origen **Video**, idioma de origen **Español**, fila de estilos/plantillas, apartado de opciones avanzadas y botón Generar. Algunas plantillas muestran distintivo de pago. | Un mismo panel debe seleccionar fuente de audio/video, idioma y estilo; el video permanece contextualizado detrás. |
| 2: opciones avanzadas desplegadas | Idioma traducido **Inglés**, ajustes de resaltado automático, emojis IA e identificación de muletillas (varios aparecen atenuados), botón Generar. | Separar subtitulado, traducción y ornamentos. No fingir opciones gratuitas o activas que requieran modelos/servicios. |
| 3: procesamiento | Ventana modal `Generando subtítulos… 45%` y botón **Cancelar**; editor atenuado atrás. | Tarea larga con estados reales, progreso honesto, cancelación y manejo de fallo/reintento. El 45% es dato visual de CapCut, no benchmark propio. |
| 4: resultado bilingüe | Texto español e inglés superpuesto en vista previa; en timeline se ven **dos filas naranjas** de segmentos de captions alineadas por tiempo, más clips de video arriba. | Representar source captions y traducción como 2 pistas editables y enlazadas a fragmentos temporales; estilos por pista. |
| 5: otro instante de reproducción | Preview del siguiente plano de nieve, timeline avanzó y no se ven subtítulos visibles en ese instante. | Las pistas requieren rango de inicio/fin real por segmento; no insertar texto constante en todo el video. No deducir causa de ausencia de captions. |
| 6: biblioteca de efectos | Vista previa arriba, buscador, pestañas de categorías (Tendencias, B.Duck, Clásica, Recorte mágico), catálogo en cuadrícula con miniaturas, nombres, iconos de descarga y distintivos. | Biblioteca categorizada con búsqueda y preview del efecto; assets propios/licenciados y descargas opt-in; no copiar miniaturas, packs ni marcas. |
| 7: efecto aplicado | Clip de video y **bloque morado de efecto** en pista inferior; zona delimitada y seleccionable; barra contextual **Ajustar, Sustituir, Duplicar, Objeto, Eliminar, Capas**. | Un efecto debe ser una instancia editable en el proyecto, con tramo temporal, orden de capas y operaciones no destructivas. |

**Importante:** las siete capturas muestran UI y estados en CapCut; NO certifican eficacia/precisión del subtitulado, traducción, calidad del efecto, exportación, ni disponibilidad de APIs abiertas.

## 2. Diseño funcional de subtítulos en Wivra (Claude/editor)

### Primera versión útil (P0/P1)
1. Desde Editor → Subtítulos → **Generar** se elige una **fuente real**: audio del video, pista separada de captura o pista importada que el usuario seleccione. No asumir siempre que el audio del MOV es correcto si existe sidecar `.wivra.json`.
2. **Idioma fuente**: manual o detección respaldada por motor real, con incertidumbre comunicada. Soportar español e inglés primero como casos de prueba; posibilidad posterior de otros idiomas.
3. STT genera segmentos temporizados `start/end/text`, opcional precisión por palabra cuando proveedor lo ofrezca. Permitir corregir transcripción antes de usar/convertir captions.
4. Se crea una **pista de subtítulos de origen** no destructiva. Cada segmento tiene tiempos editables, texto, estilo y un ID persistente.
5. **Traducción opcional** genera otra pista con idioma distinto, *vinculada semánticamente* a los segmentos fuente, pero con texto y timings que el editor permite corregir por separado. Poder ocultar/mutar visualmente una u otra o mostrar ambas como subtítulos bilingües. Las duraciones lingüísticas varían: no imponer segmentación idéntica si perjudica lectura.
6. Estilo propio editable: tipografía con licencia, tamaño, color/outline/sombra/posición; presets originales creados para Wivra, NO copias de plantillas propietarias. Preview antes de export.
7. Render consistente en vista previa y exportación, con selección `burn-in` o export `SRT/VTT` donde esté soportado. Ningún contenido se envía a proveedor de IA sin consentimiento claro y costos conocidos. Diferenciar STT local/dispositivo vs nube.
8. IA podrá proponer `captions_generate`, `caption_text_edit`, `caption_time_adjust`, `caption_style_set`, `captions_translate` mediante la misma capa validadora y undo/redo del editor, no manipulando el DOM ni el archivo de video.

### Contrato conceptual, NO API implementada
`CaptionTrack { id, type:"captions", language, sourceAudioAssetId, translationOfTrackId?, visible, style, segments:[{ id, startSeconds, endSeconds, text, sourceSegmentId? }] }`

Validar IDs, texto UTF-8, rangos temporales, marcadores de idioma, solapes intencionales, repetición de IDs y persistencia; migración del proyecto anterior. Si el audio original se edita o desplaza, informar captions desalineados y permitir realinear/recalcular sin borrar correcciones sin confirmación.

### Progreso real/cancelación
- Estado `idle → preparing → transcribing → translating? → ready | canceled | failed`, con progreso **solo cuando sea medible**. No mostrar porcentajes inventados durante tareas sin métricas; en ese caso mostrar etapas/indicador indeterminado.
- Cancelar debe detener trabajo donde posible y no insertar capturas parciales no validadas; mostrar si el proveedor cobra aun al cancelar.
- Al salir del panel preservar estado o advertir de cierre si el procesamiento continúa.
- Mantener originales y transcripción/captions editables; no sobrescribir el video.

### Test de aceptación subtítulos bilingües
- Importar clip de 30–60s con habla real, crear captions español; corregir 3 palabras y desplazar un segmento 0.4s.
- Traducir opcionalmente al inglés; elegir mostrar solo ES, solo EN o ambos. Exportar con captions y examinar tiempos al menos inicio/mitad/final. Export SRT por pista cuando exista.
- Guardar, cerrar y reabrir: captions corregidos, idiomas y estilo persisten. Deshacer/rehacer funciona.
- Eliminar la pista traducida no borra la de origen. Mute o separación de audio no deben duplicar voz.
- Repetir con video sin voz, permiso de micrófono denegado (no requerido si se usa audio ya importado), idioma incorrecto, red caída, proveedor no autorizado y cancelación a mitad de tarea.
- **No afirmar calidad del modelo o costos fijos sin prueba real**. Pruebas en Safari iPhone real antes de `VALIDADO`.

## 3. Efectos como capas no destructivas (Claude/editor)

### Capacidad P1
- Biblioteca de efectos con categorías y búsqueda propia, previews, metadata de licencia, estado descargado/disponible y un botón Aplicar que realmente modifica el preview mediante motor instalado, no solo crea un rectángulo de color.
- **Instancia `EffectClip`** asociada a video/timeline o proyecto, con `startSeconds/endSeconds`, parámetros editables, `enabled`, objetivo (`targetAssetId` o `targetTrackId`), orden de composición, referencias a assets y versión del efecto.
- El efecto queda visible como pista/bloque coloreado **distinto** de video, audio y subtítulos, con asas de duración y playhead; puede moverse, duplicarse, ajustarse, sustituirse o eliminarse.
- Un efecto puede terminar antes que el video; la exportación ha de renderizarlo **solo durante su intervalo**. Deshacer/rehacer y guardado de proyecto conservan/recuperan intervalos y parámetros.
- No usar assets de catálogo CapCut, miniaturas ni paquetes Pro sin licencia. Un motor OpenReel/OpenCut compatible podría aportar filtros/shaders reusables; hacer pruebas de licencia y rendimiento en iPhone antes de copiar/integrar.
- En Wivra la IA usa `effect_add`, `effect_set_parameters`, `effect_move`, `effect_set_duration`, `effect_remove` como operaciones tipadas con validación, preview y undo; no genera efectos inexistentes.

### Contrato conceptual, NO API implementada
`EffectClip { id, effectId, trackId, targetId?, startSeconds, endSeconds, parameters, enabled, layerOrder }`

La jerarquía clip/track/proyecto y cálculo temporal final dependen del motor elegido; **no fijar un esquema incompatible** antes de benchmark. Si se cambia de motor, preservar proyectos mediante adaptador/migración.

### Test de aceptación efecto temporal
1. Importar dos clips y añadir efecto visual A únicamente entre 2.0–4.0 segundos del primero.
2. Previsualizar antes/en medio/después; el resultado se modifica solo en la franja asignada, no todo el video. Trasladar efecto +1s y volver a previsualizar.
3. Duplicar el efecto en un segundo clip, ajustar intensidad, apagarlo, eliminarlo y usar undo/redo.
4. Guardar/cerrar/reabrir, exportar y comparar fotogramas en y fuera del rango. Si exportación no sabe procesar el efecto, avisar explícitamente y no fingir que se exportó.
5. Verificar memoria/FPS/táctil en iPhone real con efectos concurrentes y pausa/reanudación.

## 4. Riesgos, alcance y prioridad
- No confundir **dos idiomas en pantalla** con audio dual ni con doblaje: captions bilingües son dos pistas de *texto*; doblaje/lip-sync es otro módulo, con costos/privacidad.
- Efectos reutilizables con licencias compatibles son parte del editor; **no** construir efecto generativo propio para cada etiqueta de CapCut.
- P0 inmediato de editor: persistencia/proyectos, media import, audio externo real, selección/tracks con reproducción/export correctas. **Subtítulos temporizados editables** muy cerca de P0; traducción dual es P1. Efectos por capa son P1. Templates/tendencias/filtros generativos son posteriores.
- UI debe adaptarse a táctil y a pantalla vertical y horizontal; hoja inferior no debe cubrir de forma permanente preview/controles; navegación accesible con VoiceOver, estados vacíos y error.
- Relación con captura/LIVE de ChatGPT: capturas Ray-Ban/importación y URL no se ven en estas pantallas, pero deben producir assets importables por el editor. **No desarrollar el editor bajo una dependencia artificial de SDK Meta**.

## 5. Comunicación operativa para Claude PR #44
- Considerar estas siete capturas en la **matriz de OpenReel vs OpenCut Classic vs Wivra actual**, usando criterios `timed_caption_tracks`, `bilingual_captions`, `STT_provider`, `translate_captions`, `SRT_export`, `effect_timeline_clips`, `effect_preview_render_export`, `effect_time_range`, `effect_parameters`, `undo_persistence`, `iPhone_performance`.
- Identificar el origen del flujo/estado de captions y de efectos. Proponer adaptación al `core/` y capa de IA. **No reemplazar el motor ni empezar a clonar assets antes de autorización explícita del propietario.**
- Separar claramente `OBSERVADO EN CAPCUT`, `REQUISITO PROPUESTO PARA WIVRA`, `IMPLEMENTADO`, `PROBADO`, `VALIDADO iPHONE`; este doc establece los dos primeros únicamente.
- Las fotos no están en GitHub: este resumen documenta lo visible. Si Claude necesita las capturas exactas, el propietario deberá enviárselas o autorizarlas en un canal concreto.

**Reglas:** editor único, IA opcional y ejecución real, código abierto solo con licencia compatible, sin modo DJ, sin merge a `main` hasta aprobación. Fuente de verdad GitHub Wivra, investigación Meta Drive.

— ChatGPT


## NOTA DE PRIORIDAD POSTERIOR Y VINCULANTE (octubre 2026)

Aunque las capturas de CapCut incluían traducción, emojis/IA y estilos, **el propietario no quiere que Wivra profundice en esos sistemas**. Se confirma subtitulado básico automático por voz cuando el motor exista, SRT/VTT importado desde otra app, corrección mínima y subtítulos visibles en video. El nuevo diferenciador es que **Director IA puede tomar cues temporizados como guía de búsqueda, capítulos y selección de cortes**, con confirmación y sin sustituir análisis visual. El inventario original sigue siendo referencia observada de CapCut, NO backlog de replicación. Fuente de especificación y pruebas: [WIVRA_MINIMAL_CAPTIONS_IMPORT_STT_DIRECTOR_GUIDANCE_2026-10-13.md](./WIVRA_MINIMAL_CAPTIONS_IMPORT_STT_DIRECTOR_GUIDANCE_2026-10-13.md).
