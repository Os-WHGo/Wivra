# Recursos y repositorios útiles / Useful resources

> **Propuesta de Claude, 13 oct 2026.** Es una lista de candidatos, no de decisiones. El propietario del repo elige. Cada dato dice si está **verificado** (con la fuente leída) o **no verificado**. Antes de usar cualquier cosa, confirmar su licencia en el repositorio oficial.

## 1. Editar y exportar video en el navegador

| Recurso | Qué ofrece | Licencia | Estado de verificación |
| --- | --- | --- | --- |
| [Mediabunny](https://mediabunny.dev/guide/introduction) | Leer y escribir MP4, MOV, WebM y MKV; codificar y decodificar con WebCodecs (acelerado por hardware); recortar, rotar, redimensionar; sin dependencias | MPL-2.0 | Funciones y licencia verificadas. **No verificado:** soporte en Safari de iPhone (la página no lo dice) |
| [Diffusion Studio Core](https://github.com/diffusionstudio/core) | Motor de edición en TypeScript con WebCodecs y Canvas2D: capas, fotogramas clave, texto, subtítulos | Gratis, pero los videos exportados llevan marca de agua salvo con licencia de pago | Verificado en un índice de documentación, no en el repo. **Descartado por defecto:** la marca de agua choca con "sin marca de agua" |
| [OpenCut](https://github.com/OpenCut-app/OpenCut) y [Concat](https://github.com/jub0t/Concat) | Editores abiertos tipo CapCut | MIT y AGPL-3.0 | Probado en iPhone (issue #1): OpenCut carga e importa, pero el clip no se queda en la pista con el dedo |
| Omniclip | Editor web abierto | — | **No revisado** |

**Uso sugerido:** si la exportación en tiempo real del prototipo (`MediaRecorder`) falla o suena mal en iPhone, probar Mediabunny con WebCodecs como plan B (issue de exportación).

## 2. Transcripción y subtítulos en el navegador

| Opción | Detalle | Estado de verificación |
| --- | --- | --- |
| Whisper con transformers.js | ONNX Runtime Web: usa WebGPU si existe y WebAssembly si no. Modelos aproximados: tiny ~120 MB, base ~210 MB, small ~590 MB | Tamaños y velocidades vienen de un artículo comparativo. **Corrección (13 oct):** ese artículo decía que Safari no tiene WebGPU, pero caniuse y el blog de WebKit indican que **WebGPU está soportado en iOS 26 o superior** (ver `docs/VERIFICATION.md`). En un iPhone con iOS 26+ debería poder usarse la ruta WebGPU; velocidad real **no medida** |
| whisper.cpp en WebAssembly | Sin aceleración por GPU | Según el mismo artículo |
| Moonshine | Pequeño, solo inglés, sin marcas de tiempo | Según el mismo artículo |
| Meta "Muse Voice Transcribe" | Transcripción de voz de la plataforma de Meta | Aparece listada en su página de desarrolladores. **No verificado:** precio, límites, uso desde navegador |

**Pendiente:** medir tiny y base en un iPhone real con un clip de 1 minuto (issue #6).

## 3. Teleprompter

- [CueFlow](https://github.com/Hardaistee/cueflow): teleprompter web con velocidad ajustable, modo espejo, cuenta regresiva y grabación con cámara en el navegador. Licencia MIT. **Muy pequeño** (5 commits, sin versiones): sirve como referencia de diseño, no como dependencia.
- LocalCue y TiefPrompt (Android): aparecieron en la búsqueda, **no revisados**.

## 4. Proveedores de IA, incluida Meta

- **Meta Model API (Muse Spark 1.1):** según prensa, funciona con el SDK de OpenAI y formatos compatibles, y en julio de 2026 era una vista previa solo para desarrolladores de EE. UU. **No verificado:** URL base, llamadas a herramientas, entrada de imágenes y si se puede llamar desde el navegador (las páginas de documentación que leí no traían esos datos).
- **Muse Glimmer:** modelo de pesos abiertos (Apache-2.0, 30 000 millones de parámetros, publicado el 10 de agosto de 2026). Meta lo describe para una Mac o PC con una GPU de consumo y 24–32 GB de memoria. **No es un modelo para teléfono.**
- **App Muse (consumidor):** no tiene un formulario para agregar servidores MCP. Construye conectores por su cuenta sobre su máquina virtual, y Muse Code (su agente de programación) sí admite MCP. Además se puede proponer un servidor al catálogo de conectores en muse.ai/platform. Fuentes en el historial del proyecto; las fuentes no coinciden del todo, así que **probar antes de prometer**.
- AgentCut es un **cliente** de IA (la app llama a la IA), no un servidor MCP. Para que Muse o Claude "la lean" como repositorio, sirve el archivo `AGENTS.md`.

## 5. Gafas Meta (Ray-Ban Meta y otras)

**Verificado en las preguntas frecuentes de Meta:**
- El **Wearables Device Access Toolkit** da a las apps acceso a cámara, micrófono, audio, movimiento e IMU de las gafas. La versión 1.0 es estable y empezó a desplegarse el 30 de septiembre de 2026.
- Gafas compatibles: Ray-Ban Meta (Gen 1 y Gen 2), Ray-Ban Meta Display, Oakley Meta HSTN y Oakley Meta Vanguard; las capacidades varían.
- Es para apps **nativas de iOS y Android**. Las "web apps" son otra vía y corren directamente en las Ray-Ban Meta Display, sin el toolkit.
- La **publicación pública todavía no está abierta** ("pronto"). Requiere emparejar las gafas con la app Meta AI, activar el modo desarrollador, aceptar una política de uso y estar en un país compatible.

**Qué significa para AgentCut (inferencia mía):**
1. **Hoy:** una app web no puede leer la cámara de las gafas en vivo. Sí puede editar el video que las gafas ya grabaron, si llega a la galería del teléfono. **No verificado:** cómo se sincronizan los videos de las gafas con Fotos.
2. **Después:** una app nativa pequeña (un envoltorio de nuestra web) con el toolkit podría traer la cámara de las gafas al editor y así permitir un en vivo propio. Hay que revisar país, requisitos y que la publicación esté abierta.
3. El teleprompter en las gafas solo tendría sentido con las Ray-Ban Meta Display.
