# Wivra

**Crea. Graba. Edita. Transmite. / Create. Capture. Edit. Go live.**

**ES:** Wivra es una plataforma audiovisual en desarrollo: editor de video y fotografía, cámara y audio, asistente de IA opcional y herramientas LIVE para teléfonos y cámaras compatibles, incluidas determinadas gafas inteligentes.

**EN:** Wivra is an audiovisual creator platform in development: video and photo editing, camera and audio capture, optional AI assistance, and live production tools for phones and supported cameras, including compatible smart glasses.

> **Estado / Status — 15 de octubre de 2026:** varios componentes tienen código, pruebas automatizadas y prototipos en PR y ramas de desarrollo. **No existe todavía una aplicación integrada y publicada ni una validación completa en iPhone/Android o gafas físicas.** / Multiple components have code and automated tests in draft branches, but **this is not yet a released, end-to-end device-validated app**.

**Nombre / Name:** Wivra (anteriormente **AgentCut**). La comprobación definitiva de marca y derechos sobre el nombre sigue pendiente. / Formerly AgentCut; trademark/name clearance remains pending.

## Visión y arquitectura / Vision & architecture

Queremos **una sola experiencia** para crear contenido: cámara → medios locales → biblioteca/proyecto → editor → exportación y/o LIVE Studio. El editor puede utilizarse manualmente: la IA ayuda, pero no sustituye los controles normales. iPhone/iOS y Android son objetivos de producto; una futura versión para escritorio también está prevista.

We aim for **one creator workflow** across capture, media library, project, editor, export and LIVE. Manual editing remains available without AI. iPhone/iOS and Android are product targets, with desktop considered later.

La decisión técnica **no es “web solamente”**. Claude documentó la comparación entre web, híbrido y nativo: el prototipo de editor actual funciona con JavaScript en navegador; captura avanzada, cámara de gafas y emisión de video requieren puentes o módulos nativos. La arquitectura final depende de integración y pruebas reales. / **Not web-only**: the editor prototype currently runs in a browser, while advanced capture and broadcast need native bridges or modules. Architecture remains subject to testing.

## Estado real de las funciones / Feature status

| Área / Area | Código o propuesta / Code or proposal | Estado y límites / Status and limits |
| --- | --- | --- |
| **Editor y biblioteca / Editor & library** | [Editor Claude · PR #44](https://github.com/Os-WHGo/Wivra/pull/44): timeline, clips, capas/overlays, imágenes, filtros/efectos, pistas de audio y proyectos con guardado/recuperación local | Implementaciones en rama de desarrollo; pruebas automatizadas y Chromium simulando móvil. Persistencia depende del almacenamiento del navegador. **Sin validación completa en Safari de iPhone ni Android físico.** |
| **Exportación / Export** | [PR #44](https://github.com/Os-WHGo/Wivra/pull/44): exportación con audio y composición mediante APIs del navegador | Exportación de prototipo en pruebas simuladas; formatos, rendimiento, HEVC y sesiones largas requieren medición real. |
| **Director e IA / Director & AI** | [PR #44](https://github.com/Os-WHGo/Wivra/pull/44): Director, proyecto editable mediante **14 tipos de operaciones validadas**, chat/proveedor opcional y revisión previa a aplicar. [PR #64](https://github.com/Os-WHGo/Wivra/pull/64): propuesta separada de interfaz tipo chat y modo local básico | Motor y UI experimental; **#64 no está integrado automáticamente en #44**. Pruebas con proveedores y micrófonos simulados no prueban integración externa real. |
| **Cámara, fotografía y audio / Camera, stills & audio** | [PR #61](https://github.com/Os-WHGo/Wivra/pull/61) y ramas iOS de captura: cámara de teléfono, fotos durante grabación donde se permita, entrada de audio seleccionable, grabación de audio aparte + MOV y manifiesto de captura versionado | Prototipos y compilación iOS; compatibilidad de dispositivos, sincronía, rutas de audio y foto/video simultáneos pendientes de pruebas físicas. |
| **LIVE Studio** | [PR #59](https://github.com/Os-WHGo/Wivra/pull/59) y PR de escenas: Preview/Programa, cola de eventos y planificación de audio | Lógica y laboratorios locales. **Sin transmisión RTMP(S) real validada ni publicación en redes integrada.** |
| **Idiomas y subtítulos / Languages & captions** | El editor [#44](https://github.com/Os-WHGo/Wivra/pull/44) tiene catálogos de interfaz; [#65](https://github.com/Os-WHGo/Wivra/pull/65) propone internacionalización de LIVE, subtítulos y traducciones | Los textos del editor cuentan con pruebas de consistencia, **no revisión nativa de cada idioma**. Transcripción/traducción LIVE multilingüe todavía son objetivos, no funciones entregadas. |

**Android:** la interfaz web del editor es una base posible, pero no hay aún implementación nativa Android ni pruebas reales verificadas en esa plataforma. / **Android:** no native Android implementation or verified physical-device testing yet.

## Edición manual, IA y herramientas / Manual editing and AI tools

La IA propone acciones sobre el proyecto; el motor valida IDs, tiempos, formatos, pistas y revisiones. El usuario conserva el control sobre si aplicar o descartar los cambios. Las operaciones se diseñan para deshacer, controlar errores y evitar cambios parciales imprevistos. Los **14 tipos de operaciones** presentes en el núcleo experimental incluyen:

`add_clip`, `add_audio_clip`, `add_overlay_clip`, `set_overlay`, `set_audio_clip`, `set_clip_fx`, `set_clip_filter`, `set_format`, `trim_clip`, `split_clip`, `move_clip`, `set_clip_audio`, `delete_clip`, `add_text`.

A model may suggest these operations, but the editor validates them. Automated tests cover the contracts; this does not mean every workflow works on a physical phone. See the [AI tool contract · issue #3](https://github.com/Os-WHGo/Wivra/issues/3) and [Editor · PR #44](https://github.com/Os-WHGo/Wivra/pull/44).

### Proveedores de IA / AI providers

Se prevé una capa intercambiable: **Claude/Anthropic, OpenAI y compatibles, Gemini, otros proveedores y opciones locales** cuando sus APIs, licencias, plataformas y permisos lo permitan. El uso de Meta AI como asesor no presupone una API comercial integrada. También se conserva el modo manual sin proveedor externo.

External providers need separately authorized integration. **A ChatGPT or Claude chat subscription does not automatically provide third-party developer API access**; API credentials, billing, regions, rate limits and consent may differ. Do not put credentials in GitHub or upload raw media by default. Remote processing and any transfer of audio, images or frames must be made clear to the user.

La capa de herramientas histórica incluye acciones de proyecto, importación de medios, edición y exportación: `project_create/open/save`, `media_import`, `edit_apply`, `catalogue_list` y `export_run`. Estos nombres son un **contrato de producto de etapas iniciales**, no la afirmación de que todos estén conectados de extremo a extremo.

**Reglas del asistente / Agent rules:** no inventar IDs ni medios; validar el proyecto/revisión actual antes de aplicar; ejecutar operaciones por lotes de forma atómica; limitar concurrencia de exportación; solicitar confirmación antes de reemplazar o eliminar archivos; no enviar originales a servidores externos sin consentimiento.

## Internacionalización / Localization

**Editor experimental [#44](https://github.com/Os-WHGo/Wivra/pull/44):** hay una infraestructura de **8 idiomas para la interfaz**, usando `es`, `en`, `pt`, `fr`, `de`, `ja`, `zh` e `it`. Se detecta el idioma del dispositivo y hay catálogos con verificaciones automáticas de claves y plantillas. **Todavía no hay revisión profesional de traducciones, variantes regionales completas ni pruebas físicas.** `pt` no equivale todavía a `pt-BR` adaptado, ni `zh` implica haber separado chino simplificado/tradicional.

**LIVE Studio [propuesta #65](https://github.com/Os-WHGo/Wivra/pull/65):** objetivo inicial de interfaz `en`, `es`, `fr`, `de`, `it` y `ja`, con `pt-BR` e `id` planificados a continuación. Esto no reemplaza los ocho idiomas que ya existen en el prototipo de Editor.

**Subtítulos y traducciones / Captions & translation:** objetivo de **20 idiomas de destino** y exportación SRT/VTT futura, sujetos a motores, recursos, calidad y latencia medidos. **Idioma de interfaz, idioma del audio original e idioma de subtítulos son configuraciones distintas.** No anunciar transcripción/traducción LIVE operativas sin pruebas reales.

## Privacidad, recursos y terceros / Privacy and third-party resources

- Contenido y proyectos **locales por defecto cuando la plataforma lo permita**. Las funciones online deben informar destino, permisos, posibles costes y qué se envía. / Local-first where supported; external services must be explicit.
- Biblioteca incorporada y paquetes adicionales gratuitos como objetivo de diseño; cada efecto, filtro, fuente, sonido y recurso requiere licencia de uso y redistribución comprobada. / Asset packs require verified licensing.
- No copiar código, logos, textos, imágenes ni diseño protegido de CapCut u otras aplicaciones propietarias. / Do not copy third-party proprietary code, assets, branding or protected designs.
- Los SDK para cámaras comerciales tienen sus propias condiciones; una función disponible en una cámara no demuestra su uso desde una app externa. / Camera SDK capabilities need model-by-model verification.
- [OpenCut](https://github.com/OpenCut-app/OpenCut) y [Concat](https://github.com/jub0t/Concat) son referencias históricas para evaluar motores y licencias, no dependencias incorporadas automáticamente. / Technical references, not assumed dependencies.

## Plan por etapas / Roadmap

El plan original **M0–M6** es una referencia histórica, no el estado de una sola rama integrada. Las etapas se han refinado a medida que se desarrolla código real.

| Etapa / Stage | Objetivo original / Original scope | Estado al 15 oct 2026 |
| --- | --- | --- |
| M0 | Editor móvil básico / Basic phone editor | Prototipo web en ramas, no producto publicado |
| M1 | Chat y control por herramientas / Tool-driven editing | Operaciones validadas y UI experimental en PR #44 |
| M2 | Proveedores IA intercambiables / Interchangeable AI providers | Integración parcial; servicios reales pendientes |
| M3 | Herramientas de creador y subtítulos / Creator features and captions | Herramientas visuales parciales, captions no completados |
| M3b / M3c | Análisis de contenido y teleprompter / Video understanding and teleprompter | Propuestas y prototipos parciales |
| M4 | Video de podcast / Podcast-video templates | Pendiente |
| M5 | Grabación y emisión compatible / Compatible capture and LIVE | Prototipos nativos iOS y laboratorio LIVE, sin emisión real probada |
| M6 | Modelo de IA local / Local AI model | Modo básico experimental; modelo avanzado local pendiente |

**Siguiente hito técnico:** integrar de manera controlada editor, captura y LIVE bajo un contrato de proyecto/medios único, probar en iPhone físico, avanzar compatibilidad Android y verificar exportación, audio y recuperación de proyectos. / Controlled integration and physical testing are prerequisites for release.

## Preguntas abiertas / Open questions

- ¿Qué arquitectura compartirá interfaz y proyectos entre iOS, Android y futuro escritorio sin duplicar el editor?
- ¿Qué capacidades reales de cada cámara externa permite su SDK, firmware, sistema operativo y región?
- ¿Qué rendimiento y formatos de exportación funcionan realmente en Safari, iOS nativo y Android?
- ¿Qué proveedores de IA y modelos locales son seguros, compatibles, accesibles y sostenibles sin imponer pagos?
- ¿Cómo se medirán sincronía, calidad de subtítulos, latencia y accesibilidad en el uso real?
- ¿Qué licencias y avisos de terceros se necesitarán para redistribuir el código y los recursos?

## Código, colaboración y decisiones / Code & collaboration

La rama `main` mantiene una base documental inicial. **El desarrollo real se distribuye entre PR en borrador, no fusionados automáticamente**. La fuente de verdad de cada función es su código y pruebas en el HEAD real de la rama correspondiente.

- [Editor y Director / Editor & Director · PR #44](https://github.com/Os-WHGo/Wivra/pull/44)
- [Cámara iPhone / iPhone camera · PR #61](https://github.com/Os-WHGo/Wivra/pull/61)
- [LIVE Studio · PR #59](https://github.com/Os-WHGo/Wivra/pull/59)
- [Asistente chat-first / Chat-first UI · PR #64](https://github.com/Os-WHGo/Wivra/pull/64)
- [Idiomas y traducción / Languages · PR #65](https://github.com/Os-WHGo/Wivra/pull/65)
- [Coordinación · Issue #49](https://github.com/Os-WHGo/Wivra/issues/49)
- [Se buscan colaboradores / Help wanted · Issue #26 (traducciones)](https://github.com/Os-WHGo/Wivra/issues/26)

**Flujo de trabajo / Workflow:** el propietario decide integración, licencia y publicación. Cada agente o colaborador trabaja en su rama, propone un PR en borrador, registra qué está verificado y qué no, revisa cambios concurrentes antes de editar y **no fusiona a `main` sin autorización**. Las pruebas simuladas no sustituyen ensayos reales.

El trabajo inicial de Claude incluye guía de agentes, arquitectura comparada y tareas para colaboradores en su rama del Editor. Esos documentos se enlazarán desde aquí cuando se integren de forma controlada, sin agregar enlaces rotos a `main`.

## Licencia / License

**Por decidir / Not yet selected.** El repositorio es público, pero **`main` todavía no tiene una licencia general aprobada**. La visibilidad pública por sí sola no autoriza reutilizar ni redistribuir el código; cada dependencia y SDK mantiene sus propios términos. / A public repository is not automatically an open-source-licensed project. Third-party terms apply separately.
