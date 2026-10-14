# Wivra · entrega para Claude: revisar editor, PR #54 y siguiente corte de implementación
Fecha: 2026-10-14 · Dueño de implementación de editor: Claude (PR #44) · Coordinación arquitectura/captura/LIVE: ChatGPT · Hardware: Meta AI (issue #53 y Drive).

## Instrucción ejecutiva para Claude
**NO reinicies ni reescribas el editor. Lee el estado real del PR #44 y revisa el PR #54 antes de integrar. No cambies main, ramas, bases o merges sin aprobación del propietario.** Prioridad desarrollo funcional, no nuevas ideas.

Links:
- Editor Claude draft PR #44: https://github.com/Os-WHGo/Wivra/pull/44 — rama `claude/integration-director`, base `claude/ai-direct`.
- Propuesta técnica lista para revisar PR #54: https://github.com/Os-WHGo/Wivra/pull/54 — rama `chatgpt/director-story-intake-20261013`, base `claude/integration-director`; 4 verificaciones GitHub Actions exitosas en el commit revisado. **NO probado en Safari de iPhone físico**.
- Plan maestro: https://github.com/Os-WHGo/Wivra/pull/52 y issue central #49.
[línea retirada]

## 1. Revisión requerida del PR #54
Leer diff REAL y comentar con pruebas o cambios puntuales antes de incorporarlo a tu rama:
1. `core/director-intake.mjs`: persiste localmente UN brief con objetivo, estilo, correcciones y lista de tomas preproducción sin guardar URL de medios ni asset IDs efímeros; reconstruye desde formato versionado y distingue el informe narrado (no verificado) de evidencia visual. Comprobar validación y límites de almacenamiento.
2. `app/template.html`: UI móvil `Guardar mi idea aquí`, `Borrar idea guardada`, `Usar esta idea en mi asistente IA`, `Dejar de usar esta idea`. Probar iniciar proyecto SIN videos, importar después y preservar instrucciones. La voz por ahora viene del micrófono del teclado del iPhone, NO de un grabador propio.
3. `app/ai-client.mjs`: el brief viaja SOLO cuando usuario lo adjunta y luego pulsa `Pedirle a la IA`; el asistente solo recibe texto/metadata acotados, no el video. **No confundir voz importada como medio con instrucción del Director**. La IA no debe inventar escenas/times; validador y aprobación siguen obligatorios.
4. `app/build.mjs` y `app/dist/agentcut.html`: se regeneró build self-contained con el nuevo módulo. Ejecutar build y comparar archivo final; verificar que tu flujo de empaquetado no regenere un dist divergente.
5. `core/tests/director-intake.test.mjs` y `app/tests/ai-client.test.mjs`: correr pruebas, añadir casos de borrador corrupto, localStorage negado, reload en móvil, recurso descartado y nuevas instrucciones que corrijan anteriores.

**Limitaciones conocidas:** no hay persistencia de proyectos con medios reales ni modelo que vea/audioanalice todos los clips; asociación per-asset solo durante sesión, dictado por teclado, no STT incorporado para briefs; la interfaz debe etiquetar esto sin prometer producción.

**Resultado solicitado a Claude:** comentario en PR #54 con estado **Aprobar / Cambios solicitados / Bloqueado**, pruebas ejecutadas y lista corta de correcciones. Integrar solo tras autorización del propietario y cuando no rompa su roadmap.

## 2. P0 siguiente para Editor, antes de ampliar catálogo o UI
1. **Reconciliar manifiesto v2** entre `app/capture-manifest.mjs` y `streaming/contracts/wivra-manifest-v2.schema.json`, writer Swift. Roles y campos difieren: `voice-host` vs `voice_primary`, `sampleRate` vs `sampleRateHz`, `channels` vs `channelCount`, `offsetSeconds` vs `startOffsetSeconds`. Fixtures reales + backward compatibility v1; audio MOV mux + sidecar no debe duplicarse. Coordinar con ChatGPT.
2. **Motor verdadero multipista**, comparación objetiva actual versus OpenReel/OpenCut y/o arquitectura nativa, enfoque iPhone Safari y codecs, audio A1/A2, video V1/V2 simultáneos, overlay, collage, voz en off y export paridad. Entregar matriz de capacidad y recomendación, NO cambiar motor sin decisión.
3. **Primer vertical funcional:** dos videos simultáneos + dos audios independientes + split/trim/mute, guardar/reabrir proyecto y export audio/video coherente, tests automatizados y iPhone REAL.
4. Luego Director IA con análisis REAL de fotogramas/audio y planes editables, subtítulos SRT/VTT como guía opcional (prioridad acotada), biblioteca compartida ligera inicial con packs gratuitos bajo demanda. No pretender que nombres de archivos equivalgan a vision.
5. Evitar módulos ajenos: DJ dedicado, marketplace/tours, CGI 3D, packs Pro/pago, subtítulos IA elaborados. Sin herramientas falsas o botones que simulan estar implementados.

## 3. Separación de trabajo con Meta/hardware
[línea retirada]

**ChatGPT** mantiene captura, LIVE, contratos de integración y revisión de coherencia; **Meta AI** investigación física y seguridad; **el propietario** aprobación de motores, código, pruebas físicas y merges.

## 4. Aceptación/respuesta que esperamos de Claude
- Qué de PR #54 se incorpora y qué se corrige, con referencias a línea/test y captura Safari si hay.
- Resultado de tests / iPhone físico versus simulador, riesgos detectados.
- Plan de reparación manifest v2 y matriz de motor multipista con primer caso end-to-end.
- Archivos tocados, SHA, PR, rama/base preservadas.
- Próximo paso concreto y si se necesita decisión del propietario. **No merge a main.**

— ChatGPT · Handoff de revisión, no orden de merge ni de fabricación.
