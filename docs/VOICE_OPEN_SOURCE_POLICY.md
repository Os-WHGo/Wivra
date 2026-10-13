# AgentCut: política de voz 100 % gratuita y abierta
<!-- Decision proposal · 2026-10-13 · Review with Claude and future collaborators -->

**Estado:** PROPUESTA DOCUMENTADA, pendiente de revisión y validación técnica. **No está implementada.**  
**Proyecto:** [Os-WHGo/agentcut](https://github.com/Os-WHGo/agentcut)  
**Motor inicial:** [Concat](https://github.com/jub0t/Concat). La integración concreta con sus APIs todavía debe probarse.

## 1. Decisión de producto (requisito no negociable)

Toda función **esencial de voz** en AgentCut debe ser **gratuita para el usuario**, sin suscripción, cuota por minuto, créditos, marca de agua, período de prueba, inicio de sesión obligatorio o dependencia de una API de voz de pago. Se prioriza ejecución **local/offline**, reutilizando **código abierto** y modelos/pesos de voz con **licencias abiertas y redistribución permitida**. Las voces deben seguir disponibles aunque el usuario cambie de IA o no tenga internet, una vez descargados los modelos.

Aplica a: transcripción (STT/ASR), subtítulos, detección de silencios/voz, narración (TTS), voces en varios idiomas, vista previa, exportación, limpieza/normalización de audio y clonación autorizada **solo si** existe implementación abierta y gratuita compatible.

**Matices transparentes:** descargar modelos puede consumir datos móviles, batería y espacio; «gratis» significa **sin cobro del software, voces ni inferencia**, no que internet/dispositivo/electricidad sean gratuitos. Las cuentas de ChatGPT/Claude/Meta podrán ayudar con **guiones o planificación** mediante integraciones independientes y opcionales; jamás deben ser requisito ni ruta de pago oculta para usar las voces. «Sin internet» se refiere a la edición de voz instalada, no a descargar modelos por primera vez.

## 2. Reutilizar Concat antes de duplicar un motor

Concat documenta TTS, clonación de voz, subtítulos y procesamiento local, además de API JSON-RPC/gRPC/MCP. Antes de integrar cualquier nuevo motor:
1. Verificar qué operaciones de voz ofrece **realmente** la versión objetivo de Concat por API, en especial en Android; no inferir disponibilidad móvil de la documentación de escritorio.
2. Auditar código, modelos, paquetes descargados, licencias y atribuciones en `THIRD_PARTY_NOTICES.md` y en el paquete de cada voz.
3. Medir compatibilidad, consumo de memoria, tiempo, batería, calidad de salida y uso comercial/redistribución.
4. Preferir un adaptador al TTS/STT de Concat; añadir motor alternativo únicamente si falta una capacidad imprescindible o falla una prueba.

Documentación de referencia:
- Concat: https://github.com/jub0t/Concat
- Licencias de terceros de Concat: https://github.com/jub0t/Concat/blob/main/THIRD_PARTY_NOTICES.md

## 3. Tecnologías candidatas (NO aprobaciones automáticas)

| Componente | Candidato | Estado y verificación obligatoria |
| --- | --- | --- |
| Capa de síntesis/ASR móvil | [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Runtime Apache-2.0, compatible con Android/iOS; **cada modelo y sus dependencias** deben auditarse por separado. Ya se usa en Concat para TTS. |
| Voz sintética | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | Pesos Apache-2.0; evaluar voces/idiomas disponibles, rendimiento y dependencias como eSpeak NG. No asumir que todas las variantes empaquetadas son idénticas. |
| Transcripción | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Código MIT, iOS/Android y ejecución local; confirmar licencias/pesos de la versión distribuida y precisión por idioma. Evaluar primero la integración existente de Concat. |
| Voz sintética alternativa | [Piper](https://github.com/OHF-Voice/piper1-gpl) | GPL-3.0-or-later y dependencia eSpeak NG; **cada voz tiene MODEL_CARD/licencia propia**. Solo tras auditoría de compatibilidad legal/operativa con Concat AGPL. |
| Voces adicionales y clonación | Modelos ya empleados por Concat, p. ej. Pocket TTS / Chatterbox Turbo | **Candidatos de investigación**, no habilitados por defecto: comprobar código, pesos, muestras de voz, atribución, consentimiento, compatibilidad y si realmente cumplen la política de gratuidad/apertura. |

**Importante sobre licencias:** Concat declara AGPL-3.0-or-later y documenta integración con eSpeak NG bajo GPL-3.0-or-later. Que sherpa-onnx o un modelo tenga licencia permisiva **no elimina** obligaciones GPL/AGPL de la combinación. Antes de distribuir APK, web o binarios: inventario de licencias, avisos, códigos fuente correspondientes y revisión de compatibilidad. Sin validación de licencias: **no publicar esa voz**. Nunca asumir que «se puede descargar gratis» implica «código abierto» o «permiso para redistribuir».

## 4. Contrato de experiencia de voz (objetivo de diseño)

- **Una biblioteca de voces** dentro de AgentCut: idioma, variante/acento real, voz, calidad, tamaño del paquete, licencia y botón de descarga/eliminación. Cada voz debe tener una muestra gratuita.
- **Idiomas objetivo:** español (priorizar español natural, idealmente probar es-CL), inglés, francés, alemán y portugués. Mostrar solo voces realmente verificadas; no prometer acentos específicos antes de escucharlos y medirlos.
- **Narración:** texto -> TTS offline -> archivo de audio local editable -> pista independiente sobre línea de tiempo -> mezcla/exportación.
- **Subtítulos:** audio local -> STT -> marcas temporales por palabra/frase cuando el motor las permita -> revisión -> SRT/VTT/texto en timeline. No presentar tiempos aproximados como exactos.
- **Audio original:** conservar en pistas separadas; ofrecer música, voz y ambiente por separado, con ducking opcional y volúmenes controlables.
- **Edición robusta:** nunca truncar palabras por un corte, generar silencios extra sin motivo, desplazar subtítulos incorrectamente ni tapar la voz con música por un error de modelo. Vista previa, deshacer y validación antes de exportar.
- **Sin bloqueo de proveedor:** un proyecto de voz iniciado con Claude podrá continuar desde ChatGPT, otra IA o solo AgentCut: pistas, tiempos, texto, voces instaladas y metadatos pertenecen al proyecto, no al proveedor.
- **Sin red al editar audio:** si el modelo está instalado, síntesis/transcripción/preview/exportación no deben requerir conexión, cuenta ni API de pago.
- **Privacidad:** archivos locales por defecto; toda subida de audio o fotogramas es opt-in y específica. No usar grabaciones para entrenar sin permiso.

### Clonación de voz (opcional, NO prioritaria)

Solo con consentimiento expreso del titular de la voz y derecho de uso de las grabaciones. Dar controles para escuchar, identificar, eliminar la voz clonada y registrar la autorización. Nunca permitir clonación clandestina de terceros o presentar la voz como otra persona. Si un modelo no satisface requisitos de apertura, permisos y calidad, la función queda desactivada; la narración sintética normal sigue disponible.

## 5. Separación técnica propuesta

```
ChatGPT / Claude / Meta / futuras IAs / chat local
              |
       AgentCut tool contract
              |
         AudioService
           |       |
      ConcatAdapter  OptionalAudioAdapter
           |       |
           +--- VoiceModelRegistry (licencias, checksum, versión)
           +--- VoiceJobs (estado, cancelación, progreso)
           +--- TimelineValidator (no solapes ni cortes defectuosos)
           +--- MediaProject (audio, segmentos, captions, metadatos)
```

**Herramientas propuestas** (nombres del contrato AgentCut, NO métodos ya confirmados de Concat):
- `voice_list`, `voice_install`, `voice_preview`
- `speech_transcribe`, `speech_detect_segments`
- `voice_synthesize`, `audio_clean`, `captions_align`
- `voice_clone` **solo si legalmente aprobada y con consentimiento explícito**

Todas deben incluir parámetros/esquema tipado, resultado, errores, progreso, cancelación e idempotencia cuando corresponda. No adivinar IDs; utilizar los identificadores reales del proyecto. Declarar `requires_internet`, `cost_to_user=0`, `license_id` y `permission_scope` por operación/modelo. Un conector MCP o plugin externo utiliza el **mismo contrato** y no obtiene acceso libre a toda la galería sin autorización.

## 6. Criterios de aceptación para primera versión verificable

- [ ] Confirmar qué funciones TTS/STT de Concat están disponibles programáticamente en el objetivo móvil.
- [ ] Elegir **una** voz abierta y gratuita comprobada y documentar modelo, versión, peso, licencia y dependencias, con avisos de atribución.
- [ ] Generar narración local de 30 segundos y exportar sin suscripción, cuota ni conexión después de descargar el modelo.
- [ ] Transcribir un video real de 1 minuto; registrar idioma, duración, errores y desfase de subtítulos.
- [ ] Probar en dispositivo real consumo RAM/almacenamiento/batería y comportamiento sin conexión; registrar límites.
- [ ] Editar música, voz original y TTS como pistas separadas, evitando sobreposición no solicitada.
- [ ] Verificar que un cambio de proveedor (o ausencia de IA en nube) no rompe el proyecto.
- [ ] Revisar las obligaciones AGPL/GPL y licencias de cada modelo/voz ANTES de publicar un build.
- [ ] No habilitar voces o clones cuyo estado legal o consentimiento sea incierto.

## 7. Entrega a Claude y futuros colaboradores (Moos, Meta y otros)

**Para Claude (colaborador actual):**
1. Leer este documento y el README de AgentCut; contrastar cada capacidad con APIs y fuentes reales de Concat.
2. Proponer el contrato de audio y una prueba mínima de TTS offline; no prometer funcionalidad sin un build probado.
3. Publicar resultados en issues/PRs con nombre del motor, commit de referencia, dispositivo, fecha, mediciones y licencias.
4. No hacer merge automático a `main`. Crear PR revisable y mantener cambios aislados.

**Para próximos colaboradores:** contribuir mediante el mismo contrato neutral al modelo, sin convertir su proveedor de IA en requisito. No cambiar la regla de voces 100 % gratuitas sin una decisión explícita del propietario del proyecto.

### English handoff

**Hard product requirement:** AgentCut voice features (ASR/captions/TTS/basic audio processing) must be free to use, use auditable open-source software and openly redistributable voice models, and work on-device after optional model download, with **no pay-per-use voice API**. First inspect Concat's existing implementation and third-party notices; GPL/AGPL, phonemizer, and per-voice model licenses require an explicit release audit. Voice cloning is optional, opt-in, and consent-bound. This is a design proposal, **not implemented**. Use separate PRs and tests; do not merge into main without review.
