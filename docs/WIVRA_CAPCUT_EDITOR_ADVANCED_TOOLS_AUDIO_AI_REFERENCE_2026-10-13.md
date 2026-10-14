# Wivra · referencia funcional de CapCut: herramientas avanzadas, audio y traducción

**Fecha:** 13-14 octubre 2026. **Fuente:** 10 nuevas capturas de pantalla del editor CapCut aportadas por el propietario en la conversación. **Estado:** análisis visual de UI; no es prueba de que los algoritmos funcionan ni licencia para copiar su código o diseño. **Imágenes originales NO cargadas a GitHub** (evitar subir screenshots potencialmente privados y recursos de terceros).

**Leer junto a:** [plan maestro Wivra](./WIVRA_MASTER_PRODUCT_EDITOR_AI_CAPTURE_LIVE_2026-10-13.md) y [referencias CapCut Home/Proyectos](./WIVRA_CAPCUT_MOBILE_UX_VISUAL_REFERENCES_2026-10-13.md), PR #52. La aplicación objetivo sigue siendo Wivra, con editor propio de alcance comparable, IA que entiende las grabaciones, y captura/LIVE integrado. No se solicita clon visual exacto.

## 1. Elementos estructurales compartidos en las diez capturas
- Editor vertical oscuro en móvil, vista previa 9:16 grande centrada, borde de selección turquesa cuando hay clip seleccionado. El contenido visible es un video de una persona esquiando con paisaje nevado; el sujeto/archivo se usa únicamente como referencia visual, no para establecer identidad ni para copiarlo.
- Barra superior: salir/cerrar, búsqueda de herramientas, selector «IA UHD» y botón destacado «Exportar».
- Debajo: controles reproducir, expandir preview, deshacer/rehacer, indicador de tiempo y regla de timeline con cabezal vertical fijo, fotogramas secuenciales del clip, botón «+» para añadir medios.
- Franja de funciones contextuales, desplazable horizontalmente, que cambia según clip/herramienta seleccionada. La navegación permanece en el contexto de edición.
- Pistas debajo del clip para audio y texto (en capturas previas); en la última del presente lote aparece una **pista azul con forma de onda «Audio extraído1»** bajo el video original.
- Botón flotante para herramientas IA/asistente y etiquetas de funciones `Gratis` o marca de premium en algunos elementos.
- **Inferencia limitada:** los screenshots prueban presencia de controles y pistas visibles, no precisión de tracking, calidad de subtítulos, funcionamiento de exportación ni si cada función es gratuita.

## 2. Inventario de las diez capturas nuevas

| Captura | Herramientas y elementos visibles | Categoría Wivra | Estado actual de Wivra que debe comprobar Claude |
|---|---|---|---|
| 1 | Ajustar, Filtros, Retoque, Calidad del video, Eliminar fondo | color, imagen, mejora | UI/resultado no demostrado |
| 2 | Cambiar fondo (parcial), Eliminación con IA, Ampliación de IA, Remix de IA, Contacto visual | IA generativa/retoca | capacidades/modelos/licencias sin integrar |
| 3 | Ampliación de IA, Remix IA, Contacto visual, Adición de iluminación, opción anterior parcialmente visible | IA imagen y edición | dependencias en modelos externos por evaluar |
| 4 | Opacidad, Movimiento difuminado, Sincronización labial, Imitar movimiento, Cambiar expresiones; algunos aparecen atenuados | composición, IA movimiento/rostros | prestaciones NO probadas ni necesariamente activas |
| 5 | Transformación, Autoenmarcado, Estabilización, Seguimiento de cámara | crop, auto-reframe, estabilización, tracking | sin motor validado en móvil |
| 6 | Extraer audio, Aislar voz, Reducir ruido, Efectos de audio, Mejorar voz, Traductor de videos | audio multipista y procesamiento | prioridad alta: extraer audio/archivo externo primero |
| 7 | Traductor de videos, Congelar, Revertir, Máscara, Vincular, Transcripción parcial | media temporal, edición multicapa, subtítulos | requiere operaciones de timeline específicas |
| 8 | Congelar, Revertir, Máscara, Vincular, Transcripción | freeze frame, undo/reverse, mask, agrupación, texto | requiere distinguir revertir clip vs revertir acción |
| 9 | Pantalla «Traductor de videos»: reproducción preview; auto-detectar idioma fuente, seleccionar idioma destino, switch de sincronización labial, indicador créditos y botón aplicar | traducción doblaje/transcripción con costo condicionado | planificación con permisos, costo real y calidad por idioma |
| 10 | Audio extraído1 en pista azul con waveform bajo video; acciones Extraer, Sonidos, Efectos sonido, Grabar, Texto a audio y Música parcialmente visible | separación no destructiva + grabación + mezcla | PR #44 muestra audio embebido por clip, pero no importación real ni extracción independiente integrada |

**Las etiquetas describen solo lo visto**, no validación de CapCut ni de Wivra. No confundir «sincronización labial» de doblaje con «sincronizar una pista de audio externo con video», que es una función P0 distinta.

## 3. Qué se traduce en funcionalidades reales para Wivra

### P0 · Editor que se pueda usar todos los días (antes de modelos premium)
- **Extraer audio** de un clip original: crear un **nuevo media asset/pista de audio** editable, sin modificar ni borrar el original. Permitir silenciar el audio embebido, mostrar waveform real, mover/desfase/recortar la pista, ajustarle volumen y fundidos, y exportar sin **doble reproducción**. Si el motor extrae un archivo físico, cuidar formatos y almacenamiento; puede usar referencia lógica al audio original si soporta el render independiente. Explicar a usuario si se crea copia.
- **Agregar archivo de audio externo**: elegir de Archivos/Fotos cuando corresponda, colocarlo en otra pista independiente y sincronizar manualmente por palmada o ajuste temporal de precisión. Conservar ambos audios si se desea, controlar cada volumen. Manifest `.wivra.json` v2 de captura Meta debe ser compatible, pero la importación NO se limitará a él.
- **Operaciones de clip:** split, trim, delete, duplicate, move, volume, speed, crop/rotate, aspect ratio, mirror/flip (cuando se implemente), freeze frame no destructivo, vincular/desvincular audio-video, undo/redo confiable.
- **Editor contextual:** al seleccionar clip → barra de video; al seleccionar audio → barra de audio; al seleccionar texto → barra de texto; al anular selección → barra general. Controles visibles con buen tamaño de toque, búsqueda y opción de «Más». No copiar exactamente los iconos ni color de CapCut.
- **Export real con sonido** en iPhone, con timeline y pistas múltiples, control de calidad sin usar la etiqueta propietaria «IA UHD» como promesa ficticia.

### P1 · Herramientas de edición de cobertura amplia
- Ajustes de exposición/contraste/saturación, filtros propios, opacidad; máscaras geométricas, fondos, overlays, blur/motion blur básico, transiciones; transformación y keyframes.
- Efectos de audio, fade, separación en pistas, ganancia, aislamiento de voz/reducción de ruido si hay implementación probada y licencias claras.
- Estabilización, autoenmarcado y seguimiento de objetos, tras benchmark de rendimiento iPhone. Evitar prometer que es 100% local o en tiempo real sin pruebas.
- Transcripción con marcas de tiempo y subtítulos (SRT/VTT; de preferencia por palabra), traducción de **texto/subtítulos** como paso más simple antes de doblaje de voz.
- Herramientas de IA basadas en hechos: IA analiza fotogramas y transcripción realmente extraídos, solicita cortes y efectos usando las mismas operaciones validadas que el editor manual, conserva historial y revisión.

### P2 · IA generativa avanzada, con costo/privacidad verificables
- Borrado y extensión generativa, fondo/relighting, modificación de mirada/contacto visual, retocar rostro, video remix, lip-sync doblaje, emulación de movimiento y cambiar expresiones. **No afirmar que se pueden clonar esos modelos ni ofrecer gratis.**
- Para cada función definir `provider`, disponibilidad de modelo, datos a subir, costo estimado por duración/resolución, consentimiento, límites, marca de generado, calidad/latencia, fallback, política de contenido y derecho a procesar imágenes.
- Traducción de video: primero STT → traducir subtítulos → voz opcional por idioma → sincronización labial solo si proveedor/modelo admiten y se autoriza. Poner la opción como `experimental` hasta pruebas, sin afirmar créditos «0».
- Rechazar prompts que requieran descargar contenido no autorizado, eliminar marcas de agua de terceros o atribuir falsamente al modelo capacidades inexistentes.

## 4. Criterios de aceptación obligatorios del motor/editor

**Caso A: «Extraer voz de un video»**
1. Importar un MOV/MP4 con audio real y abrir en timeline. Seleccionar video, elegir `Extraer audio`.
2. Debe aparecer **otra pista independiente con forma de onda real**, misma duración/alineación inicial, nombre editable; su representación no debe ser solo una franja decorativa.
3. Silenciar el clip de video y reproducir la pista extraída: solo una voz. Desplazar la pista +0.8 s: el preview debe desplazar el sonido exactamente. Undo/redo restaura ambos estados.
4. Añadir otra pista grabada con mic externo, offset -0.3 s, volumen distinto, y exportar; comprobar que exportación conserva ambos audios, timing, ganancia y no duplica la voz del MOV combinado.
5. Guardar y reabrir proyecto; pistas, audios y archivos asociados deben sobrevivir a la reapertura/recarga, sin subir contenidos a servidores sin consentimiento.

**Caso B: «IA edita los clips, pero yo controlo»**
1. IA recibe análisis *real* de escenas/transcripción (no solo `filename`); propone trim, highlights, texto y nivelación de voz, con incertidumbres cuando falten datos.
2. Preview antes de aplicar; operaciones tipadas/validadas; usuario puede editar a mano o dar correcciones por chat; undo y export producen resultado consistente. La IA no cambia el original.

**Caso C: «Traducir voz a otro idioma» (futuro)**
1. Permiso y costos claros; origen detectado o elegible; destino seleccionable; revisar transcripción y traducción ANTES del doblaje.
2. Doblaje en pista independiente con controles de voz original y música. Sincronización labial desactivable, nunca presumir que funciona localmente.
3. Salida reversible y marcada para evaluación real de pronunciación, timing y privacidad.

## 5. Comparación de candidatos open source (instrucción para Claude)
Al evaluar OpenReel, OpenCut Classic y Wivra #44 (según PR #52), **añadir estas columnas a la matriz de funciones**:
- `extract_audio` con pista independiente y waveform real;
- `add_external_audio`, `multi_audio_mix`, `offset`, `mute`, `gain`, `fade`, `voiceover_record`;
- `crop/transform`, `opacity`, `mask`, `freeze`, `reverse`, `link/unlink`, `keyframes`, `stabilization`, `tracking`;
- `color_adjust`, `noise_reduction`, `captions/transcription`, `translate_subtitles`, `dub`, `lip_sync`;
- Safari iPhone real: formato HEVC/MOV, memoria, archivo de 1GB+, videos largos, estabilidad, render audio multitrack, export y persistencia;
- evidencia `IMPLEMENTADO PROBADO` / `IMPLEMENTADO NO PROBADO` / `PROTOTIPO` / `NO` / `NO EVALUADO`, licencia de cada librería/dependencia.

**No detenerse en el aspecto visual:** tener un botón "Máscara" o "Traductor" no prueba que exista motor, y tener una forma de onda de mentira no satisface la edición de audio. El editor real + funciones sólidas tiene prioridad sobre replicar listas de 40 herramientas de CapCut.

## 6. Reparto
- **Claude PR #44:** evalúa/reutiliza editor con licencia compatible, timeline, audio extraído + externos, render y export, subtítulos, análisis visual/IA del editor. Trabajar en `app/`, `core/` y rama propia; no sobrescribir `streaming/ios`.
- **ChatGPT PR #51:** Ray-Ban Meta, selección de micro iOS, HFP/USB, manifest v2 con canales reales, captura/LIVE/ingest autorizados; no reescribir editor.
- **Meta AI:** investigación oficial sobre SDK/meta/hardware, no introducción automática de DJ/festivales.
- **Usuario:** mantiene aprobación de cambios de motor y merges. Ningún cambio a `main` por este documento.

— ChatGPT
