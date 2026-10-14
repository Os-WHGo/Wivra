# Wivra · Biblioteca base integrada + paquetes gratuitos descargables por elección

**Aclaración del propietario (octubre 2026):** conservar exactamente la estrategia propuesta en informes de Meta AI: una base de efectos/plantillas/recursos gratuitos y pequeños *preinstalados*, y otros **paquetes gratuitos para descargar voluntariamente** cuando se necesiten. El propietario quiere esta arquitectura, NO un catálogo de 300 efectos sin pruebas y NO una tienda Pro o suscripciones. Una sola biblioteca accesible en Editor y LIVE Studio.

**Fuentes Drive revisadas:**
- RESEARCH-Editor-Efectos-OpenSource-Liviano: [enlace retirado]
- RESEARCH-Editor-Multiformato-Sonido-Memes-Players: [enlace retirado]
- RESEARCH-Sonidos-Memes-Bibliotecas: [enlace retirado]

## Arquitectura aprobada en principio

**Nivel A · Incluido, offline, gratuito, sin descarga de recursos tras instalar:** pocos filtros básicos y controles paramétricos (color, contraste, saturación, blur ligero, etc.), 6-10 transiciones sencillas, presets/títulos CG 2D originales, sonidos breves libres verificados, plantillas animadas ligeras, stickers originales o autorizados. Cantidades orientativas para planear, NO cuotas rígidas ni cifras medidas. Sin depender de IA ni internet en render/export.

**Nivel B · Packs extra GRATIS y voluntarios:** categorías "Transiciones", "Filtros / Looks", "Títulos y lower thirds", "Plantillas de cortes con música", "Efectos de sonido", "Stickers e imágenes", "CG para reportajes". El usuario ve tamaño real, lista, licencia, compatibilidad, botón "Descargar gratis" y elige si guarda local. Desinstalar pack libera espacio si ningún proyecto lo necesita, con aviso claro cuando hay referencias. No bloquear proyecto existente por borrar recursos y no eliminar assets propios sin autorización. Una vez descargado, pack debe funcionar offline y **tanto Editor como LIVE** donde el motor soporte el recurso; los que solo sirvan para uno deben indicarlo.

**Nivel C · Catálogo online opcional:** búsqueda de GIF/memes/audio autorizado a través de servicios externos con credenciales y términos de uso adecuados. **Un resultado de búsqueda gratuito NO da derecho automático a empaquetarlo, guardar copias permanentes ni retransmitirlo.** Mostrar origen/licencia y restricciones; si no hay permiso, permitir abrir la fuente o importar contenido propio, sin suplantar condiciones del servicio. No recurrir a scraping/descargas de música comercial sin derechos.

**Regla comercial:** funciones base + packs oficiales de Wivra = gratis sin premium/paywall. Las descargas consumen datos del usuario y suponen costos operativos de alojamiento para el proyecto; diseñar infraestructura liviana, cache y control de tamaños. No prometer costos externos de API, datos móviles ni proveedores como cero. Tampoco usar nombre "Pro" para packs gratuitos.

## Lo que hay en el informe vs lo realmente confirmado

1. **GL Transitions**: shader repo con licencia MIT general y **licencia por archivo**, ya existe selección documentada de diez archivos con MIT verificada en WIVRA_FREE_EFFECTS_SHORTLIST_2026-10-13.json. Útiles como candidatos a incluido o packs adicionales cuando un motor de preview + EXPORT pueda renderizarlos. Fuente: https://github.com/gl-transitions/gl-transitions.
2. **Core Image / AVFoundation**: frameworks ya incluidos en iOS, factibles como parte de implementación NATIVA; no se enchufan mágicamente al editor web de Claude. Selección del motor primero.
3. **Harbeth MIT**: candidato Swift/Metal nativo https://github.com/yangKJ/Harbeth, solo tras pruebas y evaluación de dependencias/tamaño real. "300 filtros" y "4K real-time" del informe NO validados en Wivra.
4. **LUTs**: incluir únicamente LUTs originales o verificados por recurso; la URL wess/Free-LUTs que citó Meta devolvió error y no se acepta como fuente.
5. **SFX**: Kenney, Pixabay y Mixkit son **candidatos para inspección**. No describir Pixabay/Mixkit como CC0 por defecto: tienen condiciones propias; licencias deben comprobarse por fichero/recurso, uso en app, redistribución y atribución.
6. **Memes clásicos (Imgflip, Tenor, GIPHY)**: disponibilidad de template/API no equivale a copyright libre o permiso de cache/offline/redistribución. No preinstalar 50 imágenes virales de terceros sin verificar sus derechos. Usar memes propios, plantillas originales y contenido importado por usuario; catálogos online solo cuando términos lo permitan.
7. **On-Demand Resources (iOS)** es una **posible vía de entrega nativa**, no decisión universal: actual editor de Claude es web y el soporte multiplataforma requiere abstracción de descarga/cache independiente. Evaluar distribución por CDN/manifiestos versionados y almacenamiento local según el runtime final; Apple puede cambiar modelos de entrega/limitaciones de ODR.

## Manifiesto conceptual de pack (no código implementado)

Pack: `{ id, version, title, category, preview, resources: [{sha256, file, mediaType, estimatedBytes, license, author, attribution, sourceUrl, compatibleWith: ["editor","live"]}], measuredDownloadBytes, minEngineVersion, status }`.

- IDs estables, hash verificado e integridad de assets, compatibilidad, actualización transaccional, reintento y fallo; **nunca ejecutar código arbitrario remoto** de un pack: únicamente presets/formatos/shaders firmados/aprobados y validados.
- No descargar ni ejecutar sin permiso, excepto actualizaciones menores de recursos ya instalados con política elegida por usuario.
- Favoritos/Recientes/Más usados incluyen los recursos instalados; los packs no deben hacer crecer automáticamente "Recientes" por mera vista previa.
- Versionado y bloqueo de referencias de proyecto: si pack falta, informar/permitir descarga o usar previsualización, no mostrar un proyecto roto en silencio; proyecto puede exportarse solo cuando recursos dependientes están disponibles.
- Mantener vista previa del pack si se puede hacer con recursos del catálogo pequeños y licenciados, sin descargar cien efectos para ver nombres.
- LIVE: solo disparar recursos ya cacheados/preparados. **No bloquear ni degradar la transmisión** tratando de descargar un pack en caliente; carga/preview en estado "Preparando", después "Al aire" si usuario confirma.

## Encargo de implementación a Claude, separado de tareas de Meta

**Fase 1**: definir un modelo de recursos/presets reutilizable sin duplicación entre Editor y LIVE, con licencia/versión y soporte renderer real. Incluir biblioteca base pequeña y gratuita; documentar 5-10 elementos reales que funcionen offline en preview y export.

**Fase 2**: evaluar sistema de packs adicionales gratuitos como MANIFIESTO + descarga voluntaria + cache, favoritos, indicadores "Incluido"/"Descargado"/"Solo en línea", manejo de referencias en proyectos, almacenamiento y borrado. Proponer antes de programar el backend. Primero benchmark del motor Editor de PR #44 y manifiesto de audio v2 incompatible con iOS (ver auditoría 11 informes).

**Fase 3**: integración del catálogo en LIVE, plantillas CG, memes/stickers autorizados, control deck y envío al aire sin descargar en el momento. Se comparte asset ID/plantilla, no se fuerza un motor Swift/JS único.

**No incluir packs Pro, no usar código o imágenes sin licencia comprobada, no prometer tamaño exacto de MB ni número infinito de filtros, sin cambiar `main` ni instalar/mergear bibliotecas sin aprobación del propietario.**

Referencias cruzadas:
- [Decisión gratuita/offline multipista](./WIVRA_DECISION_EDITOR_MULTITRACK_OFFLINE_FREE_2026-10-13.md)
[línea retirada]
- [Biblioteca inteligente y LIVE](./WIVRA_SHARED_ASSET_FAVORITES_SUGGESTIONS_LIVE_ALERTS_2026-10-13.md)

— ChatGPT
