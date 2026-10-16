# Wivra · trazabilidad de las ideas conversadas
Fecha: 15 octubre 2026. Este archivo complementa WIVRA_MASTER_FREE_UNIFIED_SCOPE_2026-10-15.md, PR #73.

## Interpretación de estados
- REQUISITO: idea aprobada para plan; no implica implementación.
- PROTOTIPO/PARCIAL: existe código en alguna rama, pero no necesariamente en la aplicación unificada.
- PENDIENTE: falta integrar o no se ha demostrado que funcione.
- CONDICIONADO: verificar viabilidad, licencias, permisos o dispositivo.
- Los ejemplos de terceros son referencias técnicas, no autorización para copiar diseño/código propietario.
- Costos obligatorios **cero ahora**; cuentas, API con facturación y suscripciones nunca son requisitos de uso; funcionalidades offline primero.
- Una sola app iOS/Android con un editor y biblioteca compartidos. No añadir otro editor ni un constructor de apps. Sin tocar main o la rama de Claude sin autorización.

## A · Producto y experiencia visual
| ID | Idea que debe mantenerse | Estado |
| --- | --- | --- |
| A01 | Una Wivra instalable: Cámara, Editor, AutoCut, Director y LIVE con biblioteca y proyectos únicos | PENDIENTE de integración |
| A02 | Reutilizar el editor de Claude y los módulos nativos, elegir contenedor tras probar codecs/export y puente seguro web-nativo | PENDIENTE |
| A03 | Diseño pulido y simple, chat como entrada principal, botón para dictar, controles manuales equivalentes y opciones avanzadas discretas | PARCIAL en Claude; mejorar UI |
| A04 | Mantener 8 idiomas, accesibilidad, proyecto local-first, sin cuenta Google/Apple obligatoria ni servicios pagos | PARCIAL / regla |
| A05 | Sin rastreo de ubicación constante; permisos granulares; productos físicos/novedades solo con consentimiento de comunicaciones comerciales | REGLA / marketing opcional |
| A06 | No asumir que login Google permite Google Maps API gratis; navegación externa opcional sin cobrar al usuario | REGLA |

## B · Cámaras, Ray-Ban y grabación
| ID | Idea que debe mantenerse | Estado |
| --- | --- | --- |
| B01 | iPhone y Ray-Ban Meta DAT integrados en misma app; Android nativo después y futuros lentes si soporte real | PROTOTIPOS separados |
| B02 | Cámara sencilla Auto/Pro, cambio de lente/frontal-trasera, ISO, enfoque, obturación; foto nocturna/larga exposición hasta límite real del hardware | PROTOTIPO iOS, validar |
| B03 | Foto durante grabación de video o LIVE, y desde Ray-Ban solo cuando SDK lo permita | CONDICIONADO, validar |
| B04 | Filtros tipo estilos fotográficos de Wivra, grano/vintage/B&N/cálido, intensidad; originales intactos; efectos propios no copias de Snapseed | PARCIAL |
| B05 | Entradas de micrófono seleccionables: móvil, Ray-Ban, AirPods/Bluetooth, USB/DJI/receptores externos cuando se detecten realmente | PROTOTIPO, falta hardware |
| B06 | Audio integrado en MOV y pista separada sincronizada CAF/WAV, tiempo de offset; separar canales L/R sin duplicar pista; permitir múltiples fuentes solo si hardware/OS admite | PARCIAL, PR #71 |
| B07 | Grabación larga y fiable, cámara con liberación segura, interrupciones, permisos, espacio, sobrecalentamiento y restauración de captura | PARCIAL y pruebas pendientes |

## C · Editor, AutoCut, recursos y música
| ID | Idea que debe mantenerse | Estado |
| --- | --- | --- |
| C01 | Un timeline con video, overlays/capas, pistas de audio independientes, collage, efectos, filtros, máscaras/formas, export editable | PROTOTIPO Claude, validar |
| C02 | Selector para cargar videos, imágenes, GIF y audio; fotos como clips PRINCIPALES y también como capas, duraciones editables | PARCIAL: fotos solo capas |
| C03 | Transiciones, títulos, subtítulos editables/multilingües, efectos de movimiento, estabilización/tracking/chroma opcionales en el futuro | PARCIAL / futuros |
| C04 | AutoCut para 15/30/60 s o duración exacta de audio; sugerencias de mejores segmentos, collage, fotos y video, montaje editable y reversible | PENDIENTE |
| C05 | Detección real de ritmo/silencios/transcripción/imágenes por tiempo; ocho fotogramas y diferencias de brillo NO constituyen comprensión del video | PENDIENTE análisis |
| C06 | Plantillas reels/minidoc/series, slots intercambiables foto/video, guías de qué grabar y segundos precisos, animaciones/efectos compatibles | PENDIENTE |
| C07 | Efectos y plantillas en PAQUETES bajo demanda, gratis y cacheados offline; comprobar licencia/integridad/versiones; sin descargar código ejecutable arbitrario | PARCIAL packs filtros |
| C08 | Música propia o redistribuible autorizada; importar música del usuario, recortar, mezcla/sincronización; exportar sin música para añadirla después en red social | PARCIAL música importada |
| C09 | No copiar material protegido de CapCut/Adobe ni asumir soporte de plantillas Premiere; crear Wivra original o reutilizar bibliotecas con licencia compatible | REGLA |
| C10 | Voz en off grabada posteriormente o audio directo, canales voz/ambiente, mezcla, subtítulos automáticos solo con motor realmente disponible y gratuito | PARCIAL |

## D · Director, mapas, guiones y rodaje guiado
| ID | Idea que debe mantenerse | Estado |
| --- | --- | --- |
| D01 | «Voy a Vancouver»: usuario proporciona lugares/tema, tiempo, ideas, guion; Director propone orden narrativo y tomas, sin inventar ruta geográfica | CONTRATO OFFLINE PR #73 |
| D02 | Lugares cercanos y rutas REALES a futuro, con GPS autorizado, alternativas MapLibre+OSM/mapas offline con licencias; navegación externa gratis | PENDIENTE/CONDICIONADO |
| D03 | Datos históricos o curiosidades sobre el lugar con fuente verificable; si no hay fuente, pedir datos al usuario o indicar «no verificado» | PENDIENTE |
| D04 | «Grabar con Director» o libre: tomar plano general/detalle/POV, indicar duración de video final y duración bruta recomendada, revisar, aceptar/repetir/saltar | CONTRATO PR #73, UI pendiente |
| D05 | Crear guion propio escrito/dictado o estructura de historia desde plantilla local; editar escenas, orden, tomas, imprevistos y continuidad narrativa | PARCIAL y pendiente |
| D06 | Teleprompter en pantalla mientras graba que NO se imprime en archivo, opciones audio directo, narración posterior o mixta | PENDIENTE UI |
| D07 | Minidocumentales, series y películas verticales, episodios enlazados con guion global y montajes individuales de un mismo proyecto/biblioteca | Formatos PR #73; flujo pendiente |
| D08 | Indicaciones por voz o audífonos «qué grabar», «ya la hice», «repite», «siguiente», «cambié de planes», «no puedo» y botones alternativos | Núcleo básico PR #73, faltan comandos y UI |
| D09 | Plan optimizado solo si se calcula y valida; la app NO debe afirmar distancia, horario, ruta o hecho histórico que no sabe | REGLA |

## E · IA, manos libres, LIVE e integraciones
| ID | Idea que debe mantenerse | Estado |
| --- | --- | --- |
| E01 | Intérprete local gratuito multilingüe de comandos/slang/referencias temporales; traducir a operaciones del motor de Claude, NO crear segunda IA | PROTOTIPO básico PR #73 |
| E02 | Chat fácil + botón de micrófono, IA local por defecto; conectar ChatGPT/Claude/otros solo bajo mecanismos y términos oficialmente permitidos, sin exigir tokens pagos | PARCIAL; proveedores condicionados |
| E03 | Análisis visual/audio con permiso, seleccionador de highlights basado en evidencia real y marcas de tiempo, no en filenames ni un par de muestras | PENDIENTE |
| E04 | Siri/AirPods/App Intents y controles de Meta AI/Ray-Ban por voz cuando el SDK lo permita, sin interferencia de narración o audio grabado | PENDIENTE/CONDICIONADO |
| E05 | LIVE Studio estilo OBS: múltiples cámaras/fuentes/escenas, overlays, microfonía, inicio/fin, pantallas de espera y destinos YouTube/Twitch/RTMP/RTMPS; Meta/TikTok bajo autorización | PROTOTIPOS, no emisión integrada |
| E06 | Seguridad: comando de voz nunca inicia transmisión pública ni borra originales sin confirmación clara | REGLA |
| E07 | Futuro enlace autorizado a Meta Instagram/Facebook/WhatsApp; música bajo licencia de cada plataforma, no redistribuida dentro de Wivra | FUTURO |

## F · Plan de integración verificado contra las ideas
- P0: una app real con Editor Claude + Cámara/LIVE ChatGPT; preservar módulos y versiones de idioma, sin merge directo. Resolver PR #70, #71 y #72; puente y catálogo compartidos.
- P1: Director offline por lugares/guion/plantillas, teleprompter, toma revisable, fotos como clips principales, UX manual/voz sencilla.
- P2: AutoCut editable, análisis real audio/imagen, series/episodios y packs gratuitos compatibles y verificables; Android con simulador y hardware después.
- P3 solo si no impone pagos: mapas offline verificados, datos históricos autorizados, redes y proveedores de IA externos mediante conexiones permitidas.
- QA: distinguir diseño, contrato y código en prototipo de pruebas reales; completar cámara→biblioteca→editor→guardar→reabrir→exportar dentro de un binario y verificar con medios reales cuando sea posible.

## Claude / ChatGPT
Claude: editor, persistencia, fotos principales, plantillas, render y export; revisar si sus nuevas actualizaciones ya cubren filas.
ChatGPT: cámara/audio/LIVE, intérprete de intenciones, Director offline/contratos y puente nativo, revisión cross-agent.
Propietario: aprobación de arquitectura y merges; main intacto hasta autorización.
