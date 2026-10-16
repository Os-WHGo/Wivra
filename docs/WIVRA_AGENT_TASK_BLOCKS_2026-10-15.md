# Wivra · bloques grandes de trabajo para otras IAs y el propietario
**Propietario mantiene decisión final. GitHub es la fuente de verdad.** Estos prompts no conceden accesos nuevos ni permiten reescribir main. Ningún resultado de una IA de terceros se considera verificado sin fuentes.

## Bloque A: Meta AI, investigación SDK para voz, Ray-Ban y LIVE
**Perfil:** investigación y revisión, no modificar código ni pedir acceso a cuentas privadas.

"Investiga el SDK oficial Meta Wearables Device Access Toolkit (iOS y Android, versión actual confirmada en docs oficiales). Para el proyecto Wivra necesitamos cámara/stream, micrófonos de gafas, selección de audio, foto mientras se graba video, invocación por voz tipo Hey Meta, reconocimiento de frases hacia app, control manos libres de una aplicación de terceros, uso simultáneo de streams y posibles restricciones de publicación. Entrega: (1) tabla capacidad/disponibilidad iOS-Android, (2) requisitos por versión/SDK, (3) qué se puede probar con MockDeviceKit/simulador, (4) qué requiere hardware, aprobación o Developer Preview, (5) límites de privacidad/licencia e integración de Meta AI, (6) enlaces exactos a documentación y ejemplo de repositorio. No inventes APIs ni asegures que se puede publicar una función experimental. Nada de claves, IDs privados ni credenciales. Si puedes, guarda solo el informe en un documento de Drive cuyo enlace comparta el propietario con ChatGPT."

**Entrega esperada:** un informe técnico Markdown/Drive con fuentes, sin código propietario.

## Bloque B: Meta AI u otra IA, guías de captura, guiones y fichas de lugares
**Perfil:** investigación documental y diseño narrativo, sin editar el repositorio.

"Prepara una biblioteca original de 8 plantillas de rodaje vertical para Wivra: reel viaje 15/30/60 s, minidocumental 1-3 min, POV sin mostrar cara, comida/productos, deportes/nieve, episodio microdrama, collage fotos+video. Por plantilla entrega: guion de ejemplo editable, 3-12 espacios de toma, duración en edición, segundos sugeridos de grabación BRUTA, encuadre, audio directo o voz en off, tips, alternativos si no puedes grabar la escena, y posibles efectos generales ya implementables con capas/filtros/corte/texto. No inventes lugares ni afirmaciones históricas verificadas. No copiar plantillas de CapCut ni incorporar música protegida."

**Entrega esperada:** tabla o JSON editorial (no código ejecutable) con textos originales y derechos claros.

## Bloque C: IA revisora cuando Claude vuelva
**Perfil:** auditor de editor y coherencia de integración, sin escribir en rama de ChatGPT.

"Revisa PR #74 y #73 de Os-WHGo/Wivra contra tu rama claude/integration-director. Comprueba que el HTML de Editor se incluye en el binario iOS sin perder idiomas, export, audio ni IndexedDB, que los filtros offline se empaquetan, que se preserva el core/shoot-checklist.mjs sin duplicar esquemas y que el nuevo puente no entrega rutas de ficheros inseguras. Prioriza bugs, pruebas y riesgos de WKWebView/IOS. No fusiones a main ni reescribas la rama del otro agente. Devuelve findings con archivo/línea y secuencia de integración."

**Entrega esperada:** reporte verificable en GitHub PR.

## Bloque D: Trabajo que puede hacer ChatGPT sin esperar
- Unificar árbol del proyecto iOS con fuentes del Editor y de cámara, crear ventana nativa para HTML offline y compilar CI.
- Diseñar y probar puente web↔nativo con permisos/IDs estables, importar videos/CAF y JPEG, no duplicar medios.
- Ampliar motor local de órdenes y pruebas de lenguaje, integrarlo en checklist Director en lugar de otro estado.
- Hacer prototipo de teleprompter nativo, guion, toma aceptada, fotos principales y plantillas locales, con QA.
- Investigar y probar dependencias de licencia permisiva para efectos y ritmo musical, sin cargarlas en producción sin test.
- Organizar Android en fases sobre el mismo HTML y SDK oficial; documentar diferencia simulador/hardware.
- Mantener matriz de 39 requisitos y estados probados/pendientes, con evidencia de GitHub CI.

## Bloque E: Solo el propietario, cuando sea necesario
- Decidir prioridades estéticas y aprobar UI/arquitectura; dar feedback con captura de pantalla.
- Probar en iPhone real cuando exista un binario instalado/firmado, y gafas conectadas cuando SDK/autorización lo permita.
- Autorizar formalmente cualquier costo futuro o membresía Apple Developer; NO es requisito para escribir código ni CI.
- Compartir por chat enlaces a informes Drive que Meta genere, si Meta no tiene acceso a la cuenta/Drive conectados en esta sesión.
- Confirmar licencias de música y propias grabaciones antes de distribución; nunca compartir contraseñas/tokens.

## Prioridad del momento
**P0:** PR #74: una app iOS con cámara nativa, biblioteca y Editor offline, CI en verde. Después puente de archivos real y persistencia. Meta recibe Bloque A como la mejor tarea en paralelo, luego B. Claude solo retoma cuando vuelva a estar disponible.
