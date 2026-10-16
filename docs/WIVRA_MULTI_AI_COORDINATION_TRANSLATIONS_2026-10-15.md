# Wivra | Coordinación Claude ↔ ChatGPT ↔ Meta AI
Fecha de coordinación: 15-oct-2026. Decisión operativa del propietario: integrar sin duplicar, ChatGPT encargado de todas las traducciones nativas y coordinación de los idiomas compartidos. Usuario autoriza seguir desarrollo, NO autoriza por sí solo merge a main.

## Estado verificable antes de actuar
- El editor de Claude existe en PR #44 (draft, abierto, no fusionado). Incluye 8 idiomas de editor: es, en, pt, fr, de, ja, zh, it, en app/i18n.mjs. No reescribir ni reemplazar ese sistema sin acuerdo.
- PR #73 depende de #44; PR #74 de #73; PR #75 de #74; PR #77 de #75; PR #78 de #77; PR #79 de #78. Todos son PRs draft apilados, NO se han fusionado a main.
- PR #76 es rama hermana de #75, basada en #74; requiere unión intencionada del selector de capturas del iPhone al árbol integrado, no suponer que viene automáticamente en #79.
- PR #65 documenta seis idiomas P0 de interfaz: en/es/fr/de/it/ja, con pt-BR/id P1. Esta estrategia NO sustituye el inventario ya presente de 8 idiomas del Editor Claude (pt, zh).
- PR de i18n nativo (derivado de #79) implementa en Android 31 cadenas para es/en/fr/de/it/ja, con recursos y tests para claves/parámetros. NO modifica app/template.html, app/i18n.mjs ni el motor de Claude.

## Responsabilidades, dueño de archivos y entregables
| Responsable | Módulos propios | Entregables siguientes | Prohibición de conflicto |
| --- | --- | --- | --- |
| Claude | app/, core/ del Editor, timeline, persistencia, operaciones IA/Director, renders/export | Declarar HEAD+PR+tests actuales; cerrar edición y export de clips + audio; contrato de medios/fotos con ChatGPT; coherencia de selector de idioma del Editor | No sobrescribir streaming/ios o streaming/android ni traducir pantallas nativas que lleva ChatGPT; no reescribir el motor |
| ChatGPT | streaming/ios, streaming/android, adapters cámara/Meta/audio, integración de archivos, LIVE, traducciones nativas y QA de idiomas | Mantener iOS/Android sin app duplicada; plan explícito PR #76 dentro de rama unificada; i18n nativa 6 idiomas con tests, luego P1 y accesibilidad; preparar cámara→editor | No cambiar app/template.html ni app/i18n.mjs sin contrato acordado con Claude |
| Meta AI | investigación y verificación SDK Meta/Meta AI, HFP/PCM, permisos, releases y mocks | Entregar evidencia/caveats en Drive carpeta 'Wivra - Meta AI Specialist' y enlaces de primera fuente | Sin commits sobre código base por defecto; sin declarar QA física de documentación |
| Propietario | prioridades, costos, permisos, releases, merge final | Aprobar integración a main y decisiones de producto cuando haya evidencia | Ningún agente modifica main por iniciativa propia |

## Política de fusiones
1. Trabajar en ramas actuales con fetch sobre refs remotas vigentes después de la limpieza de historial (15-oct-2026 10:04 Vancouver). Evitar antiguos clones; jamás force-push tras rechazo. No citar SHA histórico anterior a esa limpieza.
2. La unión funcional en PRs apilados ya reutiliza el editor de Claude para el host iOS y Android. Esto es INTEGRACIÓN DE CÓDIGO, NO merge al trunk ni E2E comprobado.
3. Orden de revisión: primero PR #44, luego #73, #74; crear rama de integración temporal si hace falta incorporar la rama lateral #76; después #75, #77, #78, #79 y la i18n nativa. No declarar merge realizado hasta verificar git ancestry y CI.
4. No fusionar main sin autorización explícita del propietario. Tampoco declarar un solo producto listo hasta probar captura→editor→guardar/reabrir→export en teléfonos reales.
5. Toda contribución: ruta de archivos, contratos usados, tests CI, tipo de prueba (estática, emulador o hardware) y bloqueo actual; actualizar issue #49 o PR respectivo.

## Traducción e internacionalización, a cargo de ChatGPT
- Fuente de verdad del Editor: app/i18n.mjs y catálogos existentes de Claude. Catálogos Android: res/values[-locale]/strings.xml. iOS se localizará con recursos String Catalog/Localizable; no copiar textos del Editor por DOM ni fusionar diccionarios a ciegas.
- P0 nativo: es/en/fr/de/it/ja; P1: pt-BR e id según PR #65, respetando pt y zh existentes del Editor. Clarificar con propietario antes de eliminar locales o alinear etiquetas del selector.
- Los subtítulos/traducción automática son una función distinta de traducción de interfaz. Los 20 destinos del PR #65 no son 20 idiomas de UI implementados.
- Para cualquier plantilla de cadena preservar marcadores, plurales, unidades, cortes en pantalla y accesibilidad. Mantener nombre Wivra, Ray-Ban, Meta AI y LIVE según contexto sin traducir marcas.
- La pantalla nativa Android sigue el idioma del sistema. El editor tiene selección guardada propia; una sincronización automática nativo↔web es una tarea futura que requiere acordar contrato y comprobar WebView.

## Mensaje de respuesta solicitado a Claude (para pegar en su chat)
1) ¿Qué rama y PR estás modificando ahora? Reporta último HEAD remoto, resultados CI, y archivos propios. 2) ¿Qué funciones del Editor están funcionando y cuáles solo simuladas? 3) Confirma si preservas app/i18n.mjs, los 8 locales actuales, el contrato de manifiesto .wivra.json y el audio L/R. 4) Propón un contrato mínimo de fotos como clips y el intercambio de archivos locales sin duplicarlos. 5) Confirma que no modificarás streaming/ios, streaming/android ni fusionarás main; informa conflictos encontrados sin force-push. 6) Responde en issue #49 o PR #44 con compromisos, dudas y bloqueos.

## Criterio de aceptación de la fase
- Tests editor + app nativas verdes en PRs, comprobación explícita de diferencias iOS/Android y de flujo de captura/importación; no reemplazar funciones existentes.
- Idiomas nativos P0 completos en pantallas activas mediante catálogos, con tests de paridad, sin duplicar traducción de Editor.
- PR #76 incorporado de manera segura a la rama integrada antes de llamar a la cadena Android/iOS 'unificada'.
- Las pruebas físicas necesarias declaradas pendientes hasta ejecución verificada.