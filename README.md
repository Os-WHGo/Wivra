# Wivra

**Crea. Graba. Edita. Transmite.**

**ES:** Wivra es una plataforma audiovisual en desarrollo para crear contenido desde el teléfono: editor de video y fotografía, cámara y audio, asistencia por IA, herramientas para redes sociales y transmisión en vivo desde fuentes compatibles, incluidas determinadas gafas inteligentes.

**EN:** Wivra is a work-in-progress creator platform for mobile video and photography editing, camera and audio capture, AI-assisted workflows, social content, and live streaming from supported sources, including compatible smart glasses.

> **Estado / Status (15 Oct 2026):** prototipos y componentes en desarrollo, distribuidos entre ramas y PR en borrador. El código **no es una aplicación integrada, publicada ni validada de extremo a extremo en dispositivos físicos**. / Prototype implementations across draft branches and PRs; **not a released, fully integrated or physically validated app**.

## Qué queremos construir / Product vision

Una **sola experiencia Wivra**, con flujo compartido entre cámara, biblioteca de proyectos, editor y LIVE Studio. Priorizamos iPhone y Android; una versión para escritorio es un objetivo futuro. El prototipo de editor actual utiliza tecnologías web, mientras las capacidades de captura móvil y gafas requieren integración nativa.

**One Wivra experience** across camera, project library, editor and LIVE Studio. iOS and Android come first; desktop is a future goal. The current editor prototype is web-based, while advanced capture and wearable integrations need native components.

| Área / Area | Alcance previsto / Intended scope | Estado comprobado / Verified status |
| --- | --- | --- |
| **Editor** | Línea de tiempo, clips, múltiples pistas, texto, fotografías, filtros, audio y exportación / Timeline, clips, tracks, text, photos, filters, audio, export | Prototipo web en [PR #44](../../pull/44). Tests automatizados; no validación completa en Safari/iPhone físico. / Web prototype; no end-to-end physical iPhone test. |
| **Asistente / AI** | Control manual o mediante chat y voz; modo básico local y proveedores externos opcionales / Manual, chat and voice control; local basics and optional AI providers | Funciones parciales y propuesta de interfaz simplificada en [PR #64](../../pull/64). / Partial functions and UI proposal. |
| **Cámara y audio / Camera & audio** | Cámara de teléfono, fuentes externas compatibles, selección de micrófono, fotos y pistas de audio separadas / Phone camera, supported external sources, microphone selection, stills and separate audio tracks | Prototipos iOS y pruebas de compilación en [PR #61](../../pull/61) y ramas de captura; faltan pruebas completas en equipos reales. / iOS prototypes, physical testing pending. |
| **LIVE Studio** | Vista previa/programa, escenas, audio y futura publicación a destinos autorizados / Preview/program, scenes, audio and eventual publishing to authorized destinations | Lógica y pantallas experimentales en [PR #59](../../pull/59) y PR relacionados. **Sin transmisión RTMP real validada**. / Experimental, no validated RTMP broadcast. |
| **Subtítulos e idiomas / Captions & languages** | Transcripción, pistas de subtítulos, traducción y exportación SRT/VTT / Transcription, subtitle tracks, translation and SRT/VTT export | Diseño propuesto en [PR #65](../../pull/65); transcripción y traducción automáticas aún no implementadas de extremo a extremo. / Proposed, not end-to-end implemented. |

## Principios de diseño / Design principles

- **Primero el control manual.** La IA ayuda, pero no debe ser necesaria para cortar, editar, grabar o exportar. / **Manual-first:** AI is optional.
- **Privacidad y control de medios.** Proyectos y grabaciones locales por defecto donde la plataforma lo permita. Cualquier envío a proveedores externos debe ser explícito. / **Privacy-first:** local media by default where supported; external sharing is opt-in.
- **Una biblioteca y un editor.** Captura y transmisión deben producir medios reutilizables en proyectos, sin duplicar pistas. / **One project workflow:** captured and live media should feed the editor safely.
- **Compatibilidad por capacidades.** La disponibilidad depende del modelo, SDK, sistema operativo, permisos y región; no basta el nombre comercial de una cámara. / **Capability-based integration:** device and region support must be verified.
- **Costos transparentes.** Funciones básicas gratuitas como objetivo; servicios de terceros y procesamiento remoto pueden tener costos propios. / **Transparent costs:** free core goal, optional external processing may incur fees.
- **Sin promesas prematuras.** Un test de CI aprobado no equivale a una sesión real de grabación o transmisión. / **No premature claims:** passing CI does not prove device functionality.

## Idiomas / Languages

Objetivo de localización de interfaz para Wivra LIVE: **inglés, español, francés, alemán, italiano y japonés** inicialmente; luego **portugués brasileño e indonesio**. Planificamos **20 idiomas de destino para subtítulos/traducción**, con soporte real sujeto a pruebas de cada motor. **Estos idiomas son objetivos, no funciones actualmente disponibles.**

Target LIVE UI languages: **English, Spanish, French, German, Italian and Japanese** first; **Brazilian Portuguese and Indonesian** next. We are planning **20 caption/translation targets**, subject to language and model validation. **This is a roadmap, not a shipped feature list.**

## Dónde está el código / Where development lives

La rama `main` es una base documental inicial; **el trabajo funcional se encuentra en PR separados, todavía sin fusionar**. Para revisar avances y limitaciones reales:

- [Editor / Editor prototype · PR #44](../../pull/44)
- [Camera / Cámara iPhone · PR #61](../../pull/61)
- [LIVE Studio · PR #59](../../pull/59)
- [Chat-first assistant / Asistente simplificado · PR #64](../../pull/64)
- [Languages and captions / Idiomas y subtítulos · PR #65](../../pull/65)
- [Coordination / Coordinación · Issue #49](../../issues/49)

La integración final, compatibilidad entre ramas, pruebas de dispositivo, publicación y distribución están pendientes. / Integration, cross-branch compatibility, physical testing, release and distribution remain pending.

## Colaboración / Contributing

Nos interesan pruebas de accesibilidad, UX táctil, vídeo/audio, internacionalización, SDK de cámaras y pruebas reales de iOS y Android. Los cambios se proponen mediante **PR en borrador**; el propietario revisa la integración y autoriza los merges a `main`.

We welcome contributions on accessibility, touch UX, video/audio, localization, camera SDKs and real-device testing. Propose changes through **draft PRs**; merging to `main` requires owner approval.

## Licencia / License

**Pendiente de decisión.** El repositorio es público, pero todavía **no tiene una licencia general aprobada en `main`**. Su visibilidad pública no concede automáticamente derechos de reutilización o redistribución. Dependencias y SDK de terceros mantienen sus propias licencias y condiciones.

**Not yet selected.** This public repository does **not** currently carry an approved project-wide license on `main`. Public visibility is not itself permission to reuse or redistribute the code; third-party components retain their own licenses and terms.
