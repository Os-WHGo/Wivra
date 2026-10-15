# Wivra | Catálogo móvil de ~300 opciones y diseños personalizados importables

**Decisión expresa del propietario, octubre 2026:** una **biblioteca básica de alrededor de 300 recursos/opciones** como objetivo de lanzamiento, sin hinchar la instalación ni implicar que existen 300 efectos completamente independientes; catálogo extensible a cientos/miles de recursos GRATUITOS que **solo se descargan a petición** desde servidor propio Wivra o proveedor autorizado. Permitir **importar diseños del usuario**, reutilizarlos como plantilla/asset en Editor y LIVE. Experiencia **iPhone móvil primero** para creación y consumo, pero exportación compatible con pantallas horizontales y televisores cuando el usuario la elija.

**Estado:** objetivos y criterios de diseño; no hay 300 elementos auditados, biblioteca de packs, sistema importación de diseños ni TV output validados/implementados. Los motores base del editor/captura están en PR separados. GitHub = especificación fuente de verdad; no merge a main.

## 1. Alcance de «300»: opciones utilizables, NO 300 componentes/archivos pesados

El número 300 fue citado por Meta como estimación **no probada** y ahora el propietario lo señala como guía de amplitud de la biblioteca inicial. Se convierte en **meta de catálogo de aproximadamente 300 presets/assets realmente diferenciables** únicamente después de verificar tamaño, licencia, calidad y prueba preview/export. Evitar incluir 300 botones vacíos, 200 variaciones imperceptibles y 300 shaders incompatibles solo para llegar a la cifra.

**Ejemplo de reparto ORIENTATIVO hasta 300 (NO elementos ya desarrollados):**
- 25 presets de transición / cortes y direcciones (un motor con parámetros; comprobar handles y licencias).
- 65 filtros/looks/ajustes preconfigurados (pueden derivar de operaciones de color/opacidad/contraste/blur; no necesariamente 65 shaders).
- 65 CG/títulos/lower thirds/banners/alertas/plantillas de reportaje 2D originales y tipografías con derechos.
- 35 layouts/PiP/split/collage/movimientos sencillos 2D (plantillas de transformación entre escenas).
- 30 stickers, gráficos, marcos, burbujas y recursos visuales originales/licenciados.
- 40 efectos sonoros breves con licencia individual de empaquetado verificada.
- 40 presets de ritmo/edición musical y animación temporizada como datos, sin canciones comerciales incluidas.

**Suma 300.** Este desglose se revisará al medir tamaño/usabilidad, no compromete cantidad ni garantiza licencias. **Objetivo de calidad primero:** lista mínima de funciones base P0 probada antes de inflar el catálogo; los ~300 elementos pueden entregarse progresivamente. Todas las herramientas básicas operan sin red una vez instalada Wivra.

## 2. Biblioteca expansible: cien/mil elementos sin instalarlos todos

**Clases:** `included` (integrado), `remote-wivra` (CDN propio con derecho de redistribución), `remote-provider` (servidor de tercero / API bajo términos), `user-local` (diseño/asset del usuario), `installed-pack` (descargado/caché). Catálogo navegable sin bajar todos los recursos: búsqueda, categorías, preview liviano, popularidad LOCAL propia, «Favoritos», «Recientes», «Más usados», sugeridos contextuales, tamaño estimado/medido, estado `Incluido`/`Gratis Descargar`/`Instalado`/`Solo en línea`.

- Capacidad de **miles de entradas** en el índice mediante paginación/búsqueda y carga diferida de miniaturas; **no afirmar que miles de recursos legales ya estén disponibles** o que todos los efectos terceros son libremente distribuibles.
- Descarga por uno o por pack, bajo consentimiento, sin pagos, con progreso/pausa/reintento/cancelación, destino en almacenamiento de la app, hash/manifest/versionado, y opción eliminar/limpiar caché. Uso offline después de instalación si la licencia lo permite.
- Compartir **una sola copia por assetID** entre Editor y LIVE; referencia estable en proyectos y Deck, detectar faltantes; prevenir pérdida de material personalizado al limpiar packs y avisar antes de remover un recurso que usa proyecto.
- No descargar recursos grandes durante LIVE si afectan ancho de banda, CPU o estabilidad; solo emitir material preparado. Sin packs Plus/Pro, sin ejecutar código arbitrario descargado en iPhone. Efectos paramétricos y renderer compatible ya en app.
- Licencias exactas por archivo y permiso para redistribuir/almacenar/renderizar/retransmitir, no asumir que memes clásicos de Imgflip, GIF Tenor o Giphy, SFX Mixkit/Pixabay o LUTs terceros son libres sin revisarlos.

## 3. «Mis diseños»: importar, editar y compartir voluntariamente

**P0: importación local y biblioteca personal sin cuentas obligatorias**
- Desde Fotos, Archivos/iCloud Drive y, si la integración nativa lo permite, «Compartir con Wivra» mediante Share Sheet o File Provider. El usuario escoge el archivo y se importa mediante permisos locales; **no subir automáticamente a ninguna nube**.
- Formatos iniciales candidatos sujetos a pruebas reales del renderer:
  - PNG (transparencia), JPEG/JPG, WebP estático para imágenes y memes;
  - MP4/H.264, HEVC MOV cuando hardware/API decodifique, para intro, outro, animación y video en PiP; alpha de video solo si codec/plataforma realmente compatible;
  - M4A/AAC, WAV y audio importado cuando decoder lo permita;
  - SVG **sanitizado o rasterizado al importar**, GIF/WebP animado y otros formatos solo una vez integrados con render/export idéntico; no habilitar HTML/JS activo importado.
- Desde Canva, Figma, Adobe Express u otras herramientas, usar sus funciones nativas **Exportar a PNG/SVG/MP4** y después importar en Wivra; **NO** afirmar integración API directa con esas marcas. SVG vectorial puede permanecer ajustable en escala; imágenes PNG ya compuestas no permiten editar capas internas automáticamente.
- **Editar un diseño dentro de Wivra:** texto, fuente disponible/licenciada, logo, imágenes, tamaño, color, transform/posición, opacidad, borde, duración, entrada/salida y elementos 2D cuando el formato Wivra conserve capas; guardado como **plantilla propia** y añadir a Favoritos/Deck. Archivo plano solo permite editarlo como una capa con sus ajustes, no recuperar texto/objetos ya aplanados.
- P1: exportar/importar `wivra-template.json` o bundle `.wivra-pack.zip` (nombres conceptuales, NO formato implementado) con manifest tipado, versión, asset IDs relativos, licencias/metadatos, checksums, componentes permitidos y miniatura. **Sin ejecutar scripts/remotos**, sin path traversal/symlinks maliciosos ni aceptar ZIP bombs. Validar resolución/duración/tamaños. Funciona entre Editor/LIVE y potencialmente compartir manualmente a otro dispositivo por archivo; fuente privada permanece local.
- P2 **Enviar mis diseños a catálogo público**: no forma parte del MVP; requerir consentimiento explícito, uploader autenticado, licencias, revisión/moderación de derechos/abuso, retirada y control de acceso, hosting/almacenamiento. No habilitar publicar automáticamente ni usar una carpeta de Drive como repositorio de packs públicos.

## 4. Mobile-first con salida para TV / plataformas

- La UI se opera en **pantalla pequeña en vertical**: controles táctiles grandes, previews ligeras, búsqueda/filtros en bandejas, scroll con miniaturas lazy, guardado automático fiable, barra inferior contextual Video/Audio/CG, ajustes accesibles, VoiceOver. No renderizar simultáneamente 300 efectos en pantalla ni cargar miles de thumbnails.
- **Lienzos/export** del proyecto: `9:16` prioridad para Reels/TikTok/Shorts y POV; `16:9` para YouTube largo, computadora y TV; `1:1` y `4:5` para posts, y otros solo cuando validados. La creación de títulos debe respetar zonas seguras de UI y márgenes para subtítulos/notches, en cada ratio.
- Guardar diseño con **posicionamiento en coordenadas normalizadas, anclas y márgenes seguros** y permitir variantes por ratio o ajustar manualmente al cambiar 9:16→16:9. Evitar auto-cortar caras, flyers y textos; previsualizar y preguntar por ajustes cuando haya conflictos. No estirar/squash; usar cover/contain y fondos elegibles.
- Pantalla iPhone: preview de baja carga cuando el dispositivo lo requiera; **export de calidad elegida hasta capacidades/medios reales**; no confundir resolución de preview con resolución final. H.264/AAC MP4 compatible como objetivo, HEVC/MOV opcional tras prueba; 1080p vertical/horizontal por defecto sujeto a codecs/hardware, no afirmar 4K para todos. TV puede reproducir archivo exportado 16:9 mediante sistemas compatibles; **cast/AirPlay en vivo no es requisito ni implementación**.
- LIVE: salida 9:16/16:9 según plataforma y codificador; ajustar CG por anchura/altura, posición, márgenes y safe area. Alertas, memes y diseños nunca deben quedar fuera del marco sin avisar. Probar también en iPad/tablet luego, sin exigir app separada.

## 5. Pruebas de aceptación y responsables

**Claude (Editor, PR #44):**
1. Importar PNG transparente propio y video MP4/MOV de prueba desde Files/Photos, guardar en «Mis diseños»; colocar PNG como CG/V2 en timeline, ajustar texto/posición/rango si es plantilla de Wivra, duplicar y exportar sin pixelación inesperada.
2. Cambiar diseño entre 9:16 y 16:9: verificar crop/contain, anclas, zonas seguras, que títulos se vean en video vertical y reproducción tipo TV horizontal. Export con mismo resultado que preview.
3. Mostrar biblioteca integrada y paginar índice simulado de 1.000 recursos **SIN descargar** mil archivos; medir memoria/scroll y tamaño del bundle. Simular instalar 1 pack gratis y reutilizarlo en otro proyecto; eliminar con referencia viva debe avisar.
4. Presentar análisis de qué formatos soporta editor web hoy, qué formatos requerirían renderer nativo o conversión y qué mecanismos protegen importación ZIP/SVG. **No implementar un editor de diseño completo antes de resolver multipista/export y parser manifest v2 con iOS.**
5. Elaborar diseño de estructura de catálogo con una cifra orientativa de 300 combinaciones/presets útiles, licencias y peso reales; no prometer 300 elementos disponibles hasta construirlos.

**ChatGPT (LIVE/captura, PR #51 / plan #52):** usar asset IDs/CG y layouts de la misma biblioteca con adaptadores al compositor live. Control Deck dispara recurso ya instalado, previsualiza antes de poner «Al aire», mantiene 9:16/16:9 y fallback sin afectar stream. No crear otra aplicación ni un segundo sistema de packs.

**Reparto y prioridades:** editor multipista y export verdaderos primero; catálogo amplio se hace progresivo. Una app única, sin Plus/premium, sin compras, sin plugins remotos ejecutables, sin merge a `main` sin permiso.

**Relacionado:** [biblioteca gratuita y packs](./WIVRA_FREE_BUILTIN_AND_OPTIONAL_PACKS_2026-10-13.md) · [CG compartido](./WIVRA_SHARED_CG_LIVE_EDITOR_CONTROL_DECK_2026-10-13.md) · [plan maestro](./WIVRA_MASTER_PRODUCT_EDITOR_AI_CAPTURE_LIVE_2026-10-13.md).

— ChatGPT
