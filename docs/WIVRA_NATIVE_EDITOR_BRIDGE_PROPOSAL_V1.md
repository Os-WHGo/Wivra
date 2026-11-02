# Wivra: puente de cámara nativa ↔ editor único (borrador v1)
No se ha implementado el puente. Evitar diseñar dos editores paralelos.

## Una aplicación
- JS/TS actual de Claude gobierna proyecto, timeline, Director, IA, undo, filtros y exportación mientras se mide si algunos códecs/exportadores requieren motor nativo.
- Host iOS/Android gobierna cámara del teléfono, SDKs de dispositivos compatibles donde la plataforma lo permita, micrófono, captura, biblioteca de archivos y emisión LIVE.
- Contenedor nativo + editor web integrado es un candidato, NO decisión de framework. Comparar WebView y Capacitor antes de elegir.
- Persistencia: una fuente de verdad del proyecto; el host no conserva un segundo proyecto incompatible. El editor recibe referencias estables a medios, nunca copia varios gigabytes por pasar de una pantalla a otra.

## Contrato a consensuar (no endpoints existentes)
Envelope request: { version: 1, requestId, method, args }.
Envelope reply: { requestId, ok, result?, error? }.
Funciones propuestas:
- host.capabilities: solo capacidades observadas/permiso requerido/no disponible.
- capture.startPreview(source): pedir fuente; no cambiar sin liberar recursos anteriores.
- capture.finish(): cerrar grabación y sidecars antes de devolver captureID/manifiesto.
- library.list(cursor,limit): IDs, tipo, tamaño y metadatos permitidos; sin rutas absolutas.
- library.open(assetId): handle temporal de lectura, validado por el host.
- director.savePlan(plan): persistencia según autoridad del editor, no otro sistema.
- live.prepare(): preflight; live.start() solo tras confirmación explícita del usuario.

## Contratos actuales / riesgos
- streaming/contracts/wivra-manifest-v2.schema.json y app/capture-manifest.mjs: formatos y fuentes reales; evitar duplicación L/R con PR #71; MOV original con audio embebido no debe duplicarse.
- Fotos JPEG necesitan catálogo de captura propio; nunca simular como audio en manifest v2.
- Director se basa en core/creative-director.mjs, core/shoot-checklist.mjs, core/director-intake.mjs; módulo nuevo core/director-production-plan.mjs se integra solo tras aceptación de Claude.
- Guiones, localización, rutas y datos de interés siguen locales/usuario; no inventar hechos, distancias ni navegación.
- Web↔host no admite JS arbitrario, rutas locales indiscriminadas, lectura sin permisos, ni cambios públicos por voz sin confirmación.
- app/dist/agentcut.html se regenera con node app/build.mjs si cambian fuentes del bundle y se comprueba el resultado antes de publicar.

## Criterios de la primera prueba de integración
1. Mantener los 8 idiomas y panel de Ajustes de Claude y todas sus regresiones.
2. Editar video sintético, foto y audio sobre el mismo proyecto (foto principal requiere trabajo).
3. Pasar captura de cámara terminada a editor sin duplicar bytes/sidecars.
4. Guardar/reabrir, atender archivos faltantes, exportar y recuperar tras permisos revocados.
5. En iOS/Android compilar una app instalable cuando haya arquitectura acordada y firma adecuada; avisar si aún no es posible.
6. Confirmar manualmente que LIVE no inicia por una palabra reconocida accidentalmente.

Responsables: Claude conserva motor/editor y revisa compatibilidad; ChatGPT prepara contratos, cámara/audio/LIVE y tests; propietario autoriza diseño final y fusiones. Sin merge a main.
