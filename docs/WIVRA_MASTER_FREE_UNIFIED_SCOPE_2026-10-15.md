# Wivra: alcance gratis y app unificada (15 octubre 2026)
Estado: especificación y plan de integración para revisión con Claude. NO es app terminada; el propietario aprueba fusiones.

## Reglas de producto
1. Cero costos obligatorios: sin tarjeta, APIs con facturación, suscripciones ni créditos cloud para las funciones iniciales. No prometer que terceros entregarán cómputo, IA o mapas gratis ilimitados.
2. Una app instalable iOS/Android que reúne editor, biblioteca, cámara, LIVE, Director, guiones, AutoCut y plantillas. No crear un segundo editor ni una app que construya apps.
3. Uso local sin registrarse. Google/Apple login, nube, anuncios y conectores son opcionales posteriores; marketing con consentimiento separado. No recopilar GPS permanente.
4. Ruta gratis básica: usuario indica lugares, objetivos, tiempo y orden; la app propone secuencia de rodaje narrativa y deja reordenar. El orden NO demuestra ruta más corta, horarios ni distancias. Navegación externa puede abrir el destino elegido sin consultar una API paga. GPS solo por permiso. Mapas descargables con MapLibre/datos OSM y licencias comprobadas quedan para otra fase: NO descargar/reutilizar mosaicos de Google Maps.
5. Director de rodaje: reel, minidocumental, miniserie y película vertical. Escribir guion propio, ideas, tomas, capítulos, escenas y lugares. Plantillas locales proponen apertura, planos generales/detalles/acción/cierre y segundos objetivo de edición separados de duración de material bruto. Datos locales e históricos aportados por usuario son NO verificados.
6. Toma guiada: grabar → revisar → aceptar/repetir/saltar → siguiente, sin perder tomas previas. Teleprompter opcional, voz directa, voz en off posterior, combinación; no imprimir el teleprompter en el video.
7. Control: botones manuales + chat + micrófono. Diccionario pequeño de intenciones reutilizables en varios idiomas («siguiente», «repite», «ya la hice», «otra toma», «saltar»); todo comando es propuesta contextual. Nunca iniciar emisión pública ni eliminar archivos por reconocimiento ambiguo.
8. AutoCut usa el mismo motor del editor: video y fotos como clips principales, capas, GIF, música de usuario, collage, plantillas y duración por reel o audio, pista de música opcional. Detectar ritmo/escenas debe implementarse y validarse; el muestreo de unos fotogramas NO demuestra análisis semántico ni selecciona verdaderos highlights.
9. Packs opt-in de filtros, transiciones, movimiento, marcos, textos y plantillas. Descargar y cachear solo datos/recursos compatibles con motor previamente instalado, verificar integridad, procedencia, versión y licencias. No descargar código ejecutable arbitrario ni copiar efectos propietarios.
10. Música: archivos aportados por usuario con derechos necesarios; catálogo original o redistribuible autorizado; opción de exportar sin pista comercial y añadir música desde Instagram/TikTok. La biblioteca de canciones de plataformas no se puede redistribuir libremente.
11. ChatGPT/Claude conectados son opcionales solo por autenticación oficialmente permitida; Wivra no exige ni promete uso de suscripciones personales. La IA básica funciona sin nube.

## Estado real del código al establecer el plan
- Editor/Director de Claude: PR #44 (rama claude/integration-director): motor JS, proyecto, clips y capas, imágenes/GIF actualmente como capas, biblioteca de proyectos IndexedDB, chat/idiomas, exportación web experimental. Fotos como clips principales, plantillas completas, AutoCut musical y video semántico real siguen pendientes de integración.
- Cámara iOS y fuentes externas: ramas de ChatGPT; PR #70 crea manifiesto de iPhone, PR #72 prepara biblioteca nativa, PR #71 propone protección contra duplicar CAF estéreo. Editor y cámara todavía no forman un único binario con transferencia comprobada.
- Nuevo núcleo aislado de esta propuesta: core/director-production-plan.mjs permite plan offline con lugares *aportados por el usuario*, guion manual, duración, modos de voz, orden editable, validación humana y comandos básicos. Es un contrato sin UI y NO aporta mapas, navegación, datos de interés externos ni enlace a la cámara.
- Guiones y checklist preexistentes: core/creative-director.mjs, core/director-intake.mjs y core/shoot-checklist.mjs. Reutilizarlos, no crear una segunda autoridad de proyectos.

## Prioridades acordadas
P0 - preparar UNA app:
[ ] Claude + ChatGPT evalúan contenedor híbrido (WebView/Capacitor u otra solución) y exportación/codecs; propietario decide antes de asumir framework.
[ ] Diseñar un solo catálogo de medios y protocolo versionado de cámara↔editor sin duplicar MOV/CAF/fotos, con IDs y permisos.
[ ] Revisión de PR #71, #70 y #72; integrar solo con orden de ramas acordado, no merge ciego.
[ ] Primer flujo con medios sintéticos: abrir app, importar captura, editar, guardar/reabrir y exportar sin regresiones de idioma/editor.
P1 - Director gratis sin red:
[x] Contrato y pruebas de planes aportados por el usuario, con orden manual y revisión de tomas.
[ ] Adaptarlo al Director de Claude, sin reescribir núcleo. UI plan/guion/escenas/episodios y teleprompter; manual y por voz.
[ ] Conectar las tomas a medios reales cuando existan, sin inventar grabaciones.
[ ] Fotos como clips principales en editor y exportación.
[ ] Plantillas originales de reels, minidocumentales y series con slots de imagen/video.
P2 - AutoCut y recursos:
[ ] AutoCut editable, primero determinista sin presumir IA de visión.
[ ] Análisis local de audio (silencio, golpes) y cambios visuales con límites explícitos.
[ ] Efectos y música descargables permitidos y verificables, y guardar offline.
[ ] Explorar mapas offline/mapas externos si mejoran el plan, con licencias y atribución.
P3 - futuro condicionado:
[ ] Mapas alojados/Places, sincronización en nube, OAuth opcional, publicación Meta/TikTok y modelos externos solo con revisión de derechos, costos y permisos.

## Política de pruebas y aceptación
Probar contratos con Node, pruebas de editor, artefacto HTML regenerado cuando corresponda, CI iOS y Android cuando se conecten. No equiparar compilación con prueba física. La aceptación final requiere proyecto editable único con fotos, videos y audio, biblioteca recuperable, cámara, Director y exportación verificables en dispositivos cuando sea posible. Nada de main o ramas de Claude se modifica desde esta rama; Claude revisa antes de integrar.


## Auditoría de integridad de ideas (complemento obligatorio)
Ver **WIVRA_IDEAS_TRACEABILITY_2026-10-15.md** en esta misma carpeta, con matriz A01–E07 y separación explícita REQUISITO / PARCIAL / PROTOTIPO / PENDIENTE / CONDICIONADO.

Aclaraciones que el resumen anterior no explicitaba suficientemente:
- Cámara: modos Auto/Pro, larga exposición dentro de límites físicos, fotos simultáneas con grabación/LIVE cuando se pueda, filtros estilo Wivra, Ray-Ban y micrófonos AirPods/USB/DJI, pista independiente y MOV combinado.
- LIVE: escenas/múltiples fuentes, pantallas de espera, audio y destinos RTMP/RTMPS y plataformas cuando estén autorizados; Siri, AirPods y Meta para comandos manos libres condicionados.
- Editor: efectos avanzados y subtítulos editables futuros, grabación de voz, fotos como CLIPS PRINCIPALES (no solo capas), paquetes de efectos, música autorizada y análisis audiovisual real para AutoCut.
- Director: teleprompter, datos de interés verificables, imprevistos, minidocumentales y series/films verticales, indicación de duración bruta vs duración final, accesibilidad manual/voz, control multilingüe coloquial.
- Experiencia: chat y micrófono visibles sin configuración técnica obligatoria, interfaz más cuidada, consentimiento comercial separado y sin exigir login o mapas/IA pagados.

La matriz es una lista de obligaciones para el plan de trabajo, NO una declaración de que esas funciones están implementadas. No crear módulos redundantes con Claude para intentar cumplirla.
