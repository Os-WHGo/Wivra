# Wivra · análisis de 4 capturas móviles de CapCut como referencias funcionales de UX
Fecha: 2026-10-13/14. Autor: ChatGPT. Fuente: cuatro screenshots adjuntados por el propietario a la conversación; **las imágenes no fueron copiadas ni cargadas al repositorio**. Para Claude, estas notas contienen los elementos visibles y el diseño conceptual. No se deben afirmar funciones no observables en las capturas.

## Regla principal
El usuario no está pidiendo un clon visual exacto de CapCut. Quiere un **producto propio, de funciones comparables**, reutilizando **código open source con licencias compatibles**, sobre el cual incorporar IA que *entienda* el material y realmente edite, importación por URL legítima, Ray-Ban Meta, audio configurable y LIVE de varias plataformas cuando estén habilitadas. Conservamos los avances de PR #44 y la captura de PR #51. No trasplantar branding, iconos originales, banners/promos, ilustraciones/modelos, assets Pro, textos exactos ni estilos de marca.

## Observaciones de las 4 imágenes

### Captura 1: inicio CapCut, pantalla Editar con cabecera azul de promoción
- Encabezado/banner promocional superior con buscador y distintivo Pro.
- Acciones dominantes: bloque ancho **Video nuevo** y bloque **Editar foto** (con icono grande).
- Proyectos recientes como tira de miniaturas, al menos tres, una muestra foto, otras vacías; algunos con estado de nube.
- Cuadrícula de accesos rápidos (3 columnas): AutoCut, Retoque, Generador de IA, Herramientas de foto, Creador de historias de IA, Disparar y grabar, Mejorar automáticamente, Creador de portadas, Subtítulos automáticos, Recortadora IA, Eliminar fondo, Editor de fotos IA...
- Barra inferior persistente: Editar, Plantillas, Lab. de IA, Proyectos, Yo.

### Captura 2: mismo inicio, continuación de cuadrícula de herramientas
- Bloques primarios representados como tarjetas pastel anchas con iconos `+` y foto.
- Cuadrícula de 3 columnas y etiquetas de dos líneas, amplio espacio táctil.
- Funciones visibles adicionales: Espacio, Ajustar velocidad, Herramientas de marketing, Herramientas de audio, Herramientas de avatares, acceso a todas las herramientas.
- Lección: cantidad de herramientas es grande pero agrupable. **No** volcar 15 botones de baja prioridad al primer viewport móvil Wivra; ofrecer «Todas las herramientas», búsqueda y categorías.

### Captura 3: gestión de Proyectos
- Título Proyectos, lupa, controles superiores y menú de más opciones.
- Un banner de creación asistida/IA.
- Pestañas separadas **Local / Espacios / Archivos multimedia / Papelera**.
- Filtros tipo chip: Todas, Video, Foto, Plantilla, Cámara y más.
- Lista de proyectos con miniaturas, título, fecha/hora, duración, tamaño de archivo y menú de tres puntos.
- CTA `+` Crear fijo inferior derecho; estado de contenido local y nube diferenciados.
- Lección: biblioteca seria con estados, persistencia, navegación, filtros, recuperación y media assets; Wivra necesita evitar proyectos que desaparezcan al recargar Safari. No habilitar subidas a nube sin consentimiento.

### Captura 4: laboratorio IA y tendencias
- Navegación horizontal Todo / Video / Tendencias de IA / Imagen; filtros/chips (ej. For You, Seedance, Trending).
- Tarjetas verticales con videos e imágenes de ejemplo, títulos y datos de popularidad, dos columnas.
- Compositor de acción en panel flotante inferior: AutoCut, `+`, tipo Video, selector de modelo generativo, micrófono y flecha enviar.
- Lección: separar **Asistente de edición de MIS MEDIOS** de un mercado/galería de **generación de contenido y tendencias**. Wivra debe privilegiar «IA, edita estos clips», no confundirlo con «genera un video sintético». Ninguna dependencia obligatoria de Seedance o un proveedor concreto, ni alojar trends ajenos sin licencia.

## Mapa de navegación propio propuesto para Wivra (no pixel-perfect)
Usar como marco de evaluación de Claude, **no especificación UI ya aprobada**:
- **Editar / Inicio:** Nuevo proyecto, Importar de Fotos/Archivos, proyecto reciente, Retomar proyecto, Herramientas más usadas, atajo para editar con IA.
- **Capturar:** cámara iPhone / Ray-Ban Meta, fuente de audio activa comprobada, grabar local; selección de cámara y micrófono independientes. Permitir comenzar captura desde editor/proyecto.
- **LIVE:** destino YouTube/Twitch/Instagram/TikTok cuando habilitado, o URL RTMPS/RTMP propia + clave segura, pruebas de conexión, controles simples audio (1 ó 2 canales reales), indicador EN VIVO, terminar y conservar grabación local si se consiente. En MVP aún NO implementado.
- **Proyectos:** Local, medios, papelera/restauración (si se implementa), filtros Video/Audio/Imagen/Captura, títulos, miniaturas, duración, tamaño, autosave, recientes, acciones duplicar/renombrar/archivar.
- **IA:** una sola conversación del proyecto que **observa/anota** clips reales (fotogramas/transcripción), muestra plan de edición y ejecuta operaciones validadas/deshacibles. Opcional subapartado «Crear con IA» con acceso a proveedores autorizados; no mezclar generación sintética con edición del material del usuario.
- **Más/Perfil** como menú/settings si 5 botones principales ocupan el espacio; adaptación tablet/iPad con navegación lateral.
El orden visual debe diseñarse desde la primera tarea del usuario, no copiar la barra exacta de CapCut.

## Hoja de capacidades según capturas y resto del objetivo del propietario

| Función | Ubicación Wivra candidata | Estatus verificado (en app Wivra) | Etapa |
|---|---|---|---|
| Nuevo video/proyecto | Inicio/editor | prototipo parcial #44 | P0 |
| Editar fotos | Herramientas/Editor | no verificado | P1 |
| Proyectos persistentes y recientes | Proyectos | no validado de punta a punta en móvil | P0 |
| AutoCut | Editor IA | acciones IA prototipo, NO montaje automático confiable | P1 |
| Subtítulos automáticos | Editor/IA | no completo | P1 |
| Herramientas audio, varias pistas | Editor | audio por clip prototipo, audio externo pendiente | P0 |
| Velocidad | Editor | no verificado | P0 |
| Mejorar video/retoque | Editor | no verificado | P1 |
| Eliminar fondo, máscara | Editor | no verificado | P1 |
| Portadas/miniaturas | Exportar/Editor | no verificado | P1 |
| Plantillas | Biblioteca/Plantillas | no verificado | P2 |
| Generación de imágenes/video IA | IA opcional | no verificado | P2 |
| Narración, avatar IA | IA/Editor | no verificado | P2 |
| Captura con Ray-Ban/iPhone | Capturar | prototipo iOS #51, NO hardware validado | P0/P1 |
| LIVE plataformas | LIVE | arquitectura/planning, NO transmisiones reales | P1 |
| Importar medio por URL y destino RTMPS | Biblioteca vs LIVE | no desarrollado e interfaces separadas | P1 |

## Requisitos que estas imágenes NO demuestran
Las 4 capturas enseñan **inicio, proyectos y descubrimiento IA**, **no una pantalla de timeline/editor en detalle**. No deducir de ellas cómo funcionan capas, keyframes, transiciones, scrubbing, shortcuts ni export. Para inspiración de la timeline, usar código abierto licenciado, pruebas reales del editor existente y otras referencias aportadas con permiso.

## Encargo a Claude (dueño de `app/` y `core/`)
1. Incorporar estas observaciones a la comparación de motores y la matriz de 25+ funciones definida por [plan maestro PR #52](https://github.com/Os-WHGo/Wivra/pull/52). Separar **estructura de producto** vs **motor de editor**. No inventar una homepage repleta de herramientas que no están implementadas.
2. Crear después un wireflow de Wivra original para iPhone: **Home → Nuevo/Importar → Proyecto → Editor con IA → Exportar**, y accesos paralelos a Capturar y LIVE. Proyectos realistas persistentes y recientes.
3. Preparar propuesta de UI y pruebas con toque real/simulator, accesibilidad, orientación vertical/horizontal, carga, navegación y estados vacíos. Mantener iconografía neutral/propria, sin banners publicitarios imitados ni diseños idénticos.
4. Evaluar clonación segura de OpenReel/OpenCut Classic en sandbox y la **integración** del motor elegido antes de producción de UI pixel-perfect. Presentar cambios como PR borrador y pedir aprobación antes de reemplazos.
5. La IA central NO solo ofrece filtros o genera videos: debe **entender material del usuario** y ejecutar ediciones reversibles. Las herramientas que aparezcan en Wivra necesitan implementación real o señalización explícita como futuras, nunca botones ficticios.

## Notas de acceso y derechos
Las capturas son referencias aportadas en el chat por el propietario. Este archivo solo recopila descripciones hechas a partir de ellas; ninguna captura se ha adjuntado ni publicado en GitHub. Claude podrá leer el análisis en GitHub, pero necesitará que el usuario le muestre las imágenes si pretende hacer una inspección visual directa. Todas las funciones de terceros requieren licencia compatible y marcas/medios de terceros se mantienen fuera del producto.

— ChatGPT
