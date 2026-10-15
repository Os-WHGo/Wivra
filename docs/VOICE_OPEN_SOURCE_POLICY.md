# AgentCut · voces y audio en la versión web móvil (propuesta)

**Estado:** PROPUESTA para revisión de Claude y decisión del propietario. **No implementado.**  
**Fecha:** 2026-10-13. **Proyecto objetivo:** editor **web solo para teléfono**, Safari iPhone y navegadores Android; no APK ni aplicación nativa como requisito.

## Prioridades reales

- **M0 ahora:** lograr que un clip seleccionado en el móvil permanezca en el editor, se pueda cortar, añadir texto y exportar. El prototipo y las pruebas de hardware se revisan por separado.
- **Después de M0 validado:** guion y chat; transcripción, subtítulos y voz.
- **Posteriormente:** voces multiidioma, mejor calidad, clonación consentida, paquetes opcionales para uso sin conexión y mini IA.

Esta propuesta **no bloquea M0** ni ordena incorporar un motor nativo.

## Preferencia expresada por el propietario y opciones por decidir

El propietario pidió que las **funciones de voz sean totalmente gratuitas** y se aproveche cuanto sea posible el código abierto. Se proponen dos vías, con sus ventajas y limitaciones, para que el propietario y el coordinador evalúen:

| Alternativa | Ventaja | Limitaciones / decisión pendiente |
| --- | --- | --- |
| **A. Modelos y motores de código abierto en navegador (preferida para investigar)** | Sin API pagada por minuto, opción de ejecución local, control de privacidad y voces portables | Descarga inicial, memoria de Safari, WebAssembly/WebGPU, licencias separadas de motores/modelos, posible rendimiento limitado |
| **B. Voces integradas del sistema/navegador** | Prototipado rápido y sin incluir grandes modelos en el sitio | Calidad/idiomas diferentes por dispositivo; **no garantiza software/voz abierta ni offline**; puede incumplir la preferencia de apertura |

Las APIs de IA en la nube de pago, si se ofrecen para **guiones creativos**, deben ser opcionales, transparentes y **no** sustituir silenciosamente una voz gratuita. El usuario elige el proveedor; su suscripción de chat no habilita automáticamente un API para terceros. La carga de audio, fotogramas o videos completos a servidores requiere autorización explícita, y el video debe permanecer en el teléfono por defecto.

## Candidatos de código abierto que requieren pruebas web

**Datos verificados de código / licencias de repositorio (NO prueban compatibilidad móvil):**
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp): repositorio con licencia **MIT**. Candidato para transcripción local; empaquetado WASM, pesos, almacenamiento y exactitud en Safari **no verificados**.
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx): repositorio con licencia **Apache-2.0**. Candidato para TTS/ASR; integración y rendimiento de **los modelos concretos** en navegador aún **no verificados**.
- [Kokoro](https://github.com/hexgrad/kokoro): repositorio **Apache-2.0**. La licencia de repositorio no certifica por sí sola cada voz, peso, dependencia ni combinación lista para web.
- [Concat](https://github.com/jub0t/concat): código **AGPL-3.0-or-later**; su implementación Rust de TTS [`concat-speech/src/tts.rs`](https://github.com/jub0t/concat/blob/main/src/crates/concat-speech/src/tts.rs) usa sherpa-onnx. **Esto no demuestra una API de voz web/iPhone**. No se requiere incorporar Concat al editor web inicial; no atribuirle obligaciones AGPL a una implementación independiente que no incorpore ni derive de su código.

**Pendientes / no verificados:** cualquier modelo TTS alternativo (incluido Piper) debe pasar evaluación de licencia de **código, pesos, voz individual y fonemizador**; no asumir que una voz descargable es libre para redistribuir. No escoger motor antes de una prueba real en Safari.

## Funciones futuras (no implementadas)

- Transcribir el audio en idioma detectado; mantener tiempos y permitir corregirlos manualmente.
- Narrar desde texto y crear pista de audio independiente, editable y reproducible.
- Mantener voz original, efectos y música en pistas separadas; evitar cortes de palabras y exportaciones sin consentimiento.
- Registrar licencia, tamaño y versión de cada modelo descargado, idealmente descargado bajo demanda; ofrecer eliminación local para liberar almacenamiento.
- Si alguna vez se introduce clonación: consentimiento del titular, eliminación y prohibición de suplantación no autorizada.

## Herramientas de IA y esquema único

**No crear una API de voz paralela.** Las futuras funciones `voice_list`, `voice_synthesize`, `speech_transcribe` y otras deben incorporarse al **contrato unificado del [issue #3](https://github.com/Os-WHGo/agentcut/issues/3)**, con errores, permisos y progreso consistentes. Los nombres propuestos NO son métodos disponibles en la app.

## Validación y siguiente paso

1. Revisar el prototipo web M0 y completar en iPhone/Android: importar, cortar, poner texto y exportar un clip real.
2. Solo después, comparar **dos motores** de transcripción/síntesis web en un clip de 20 segundos, registrando memoria, tiempo, calidad, licencia y soporte offline.
3. Documentar pros y contras; el propietario decide el motor y las funciones definitivas.

Claude coordina la revisión técnica a petición del propietario; ChatGPT y otros colaboradores proponen cambios por ramas y PR en borrador. **No se fusiona desde este documento.**

— ChatGPT
