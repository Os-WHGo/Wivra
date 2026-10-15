# Wivra B1L · Catálogo local de capturas (núcleo, no interfaz)

Esta etapa aporta un catálogo puro de metadatos (`streaming/library/capture-catalog.mjs`) y una pantalla nativa SwiftUI (`WivraNativeCaptureLibraryScreen`) para listar archivos locales ya terminados.

## Comportamiento implementado
- Recibe una lista de manifiestos **v2** con los nombres de archivos que una capa autorizada ya ha localizado, sin abrirlos ni copiarlos.
- Agrupa capturas por día en una zona horaria **explícita** (p. ej. \`America/Vancouver\`), orden cronológico y etiqueta \`Día 1, 2, 3\` calculable a partir de \`dayNumber\`. No deduce ubicaciones, nombres de personas, actividades ni eventos.
- Diferencia archivo HEVC/MOV original, MOV combinado y CAF independientes sin suponer que \`tracks: []\` significa ausencia de audio integrado en MOV.
- Informa archivos faltantes, captura incompleta y \`captureID\` duplicado; rechaza nombres de archivo con rutas inseguras.
- El módulo puro produce metadatos, NO videos ni assets del editor. La pantalla nativa lee `.wivra.json` de las carpetas locales existentes, agrupa por días, informa archivos ausentes y permite compartir MOV/CAF/manifiesto de forma explícita. No borra archivos, no transmite ni abre una cámara.
- La pantalla «Mis capturas» solo puede abrirse cuando ambas fuentes están liberadas para evitar leer un MOV inacabado. La foto JPEG todavía no aparece en esta biblioteca porque el manifiesto v2 actual describe video, no fotos.
- Esto no sustituye la biblioteca IndexedDB de Claude ni efectúa importación automática.

## Handoff con el editor de Claude
El editor ya implementa \`app/capture-manifest.mjs\`, importación manual de \`.wivra.json\` + medios y múltiples proyectos mediante IndexedDB. El contrato siguiente consiste en pasar capturas que \`readyToInspect\` marque como disponibles al selector del editor, siempre tras consentimiento y verificación de códecs/audio. Los proyectos son ediciones; los grupos por día son una vista de capturas, no carpetas que dupliquen originales. Las fotos JPEG requieren su propio catálogo futuro, porque manifiesto v2 documenta video y pistas, no fotos.

### P0 para revisión de Claude
- Revisar PR #71: un CAF estéreo con índices L/R NO debe reproducirse dos veces ni silenciar un MOV con audio, sin extracción real previa.
- Distinguir \`audioSource: none\` de la posibilidad de sonido embebido en el MOV del iPhone.
- Verificar en Safari importación manual + guardar/reabrir con archivos reales (pendiente prueba física); para videos largos revisar cuotas de almacenamiento, no prometer persistencia indefinida.

El catálogo no se publica como lista pública de capturas ni incluye archivos privados del usuario. Todas las pruebas son sintéticas. No modifica \`main\`, LIVE ni \`app/\`.
