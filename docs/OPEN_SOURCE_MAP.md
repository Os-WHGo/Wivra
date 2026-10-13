# Mapa de software abierto para AgentCut: IA en el teléfono, sin servidores y video

> **Claude, 13 oct 2026.** Lo que sigue es una lista de **candidatos**, no decisiones. Decide el propietario. **[V]** = lo leí en la página o el repo oficial ese día; **[NV]** = no lo verifiqué. Clones hechos para leer: omniclip y WebAV (junto a los de las gafas ya revisados). No se copió código a este repo.
>
> **Regla de licencias:** una pieza sin archivo de licencia no se reutiliza. Una licencia "de repositorio" no cubre los pesos de un modelo, ni los datos, ni el SDK de otra empresa. Esto no es consejo legal.

## 1. IA pequeña en el teléfono (que sea compatible con los lenguajes de OpenAI, Claude, Meta y chinos)

**Idea de diseño:** AgentCut habla con cualquier IA por un formato común (el de OpenAI con herramientas; el de Anthropic es el otro formato frecuente). La IA local es **un proveedor más** de esa lista. Así la misma lista de herramientas sirve a la IA de la nube y a la del teléfono. Una IA pequeña hace las órdenes sencillas ("corta al segundo 5", "quita el texto"); los planes largos van a la nube; el validador del editor revisa todo, porque los modelos pequeños fallan más al encadenar pasos (**[NV]**, no lo medimos).

### Modelos pequeños con licencia abierta

| Modelo | Licencia | Qué trae | Estado |
| --- | --- | --- | --- |
| **Gemma 4 E2B** (Google) | **Apache-2.0 [V]** en su [ficha](https://huggingface.co/google/gemma-4-E2B-it). Las versiones anteriores de Gemma tenían [términos propios](https://ai.google.dev/gemma/terms) con política de uso prohibido | 2,3 B de parámetros efectivos; entiende texto, imagen y audio; 128 mil de contexto; uso de herramientas nativo **[V]** | El mejor candidato por ahora |
| **Qwen 3.5 2B** (Alibaba) | **Apache-2.0 [V]** ([ficha](https://huggingface.co/Qwen/Qwen3.5-2B)) | Texto e imagen (acepta video); contexto de 262 mil; llamadas a herramientas **[V]** | Candidato |
| **gpt-oss-20b** (OpenAI) | **Apache-2.0 [V]** ([OpenAI](https://openai.com/index/introducing-gpt-oss/)) | Hecho para agentes y herramientas | **No cabe en un teléfono:** pide unos 16 GB de memoria **[V]**. Sirve en una computadora propia |
| **Muse Glimmer** (Meta) | Apache-2.0 (según `RESOURCES.md`) | 30 000 M de parámetros | No es para teléfono |
| **Llama 3.x pequeños** (Meta) | Licencia propia de Meta | — | **[NV]** no revisé sus condiciones actuales |
| **Claude** | Sin pesos abiertos | — | Solo por API |

### Programas para ejecutarlos (runtimes)

| Programa | Licencia | Plataformas | Notas |
| --- | --- | --- | --- |
| **LiteRT-LM** (Google) | Apache-2.0 **[V]** | Android, iOS, web, escritorio. Kotlin estable; **Swift y JavaScript en vista previa**. Llamadas a herramientas, visión y audio **[V]** | En un iPhone 17 Pro, Gemma 4 E2B dio ~61 fragmentos de texto (tokens) por segundo con ~500 MB, la más rápida de su prueba **[V como dato de un tercero]** |
| **llama.cpp** | MIT **[V]** | Hay guía para Android y XCFramework para Apple **[V]**; visión y audio incluidos | ~39 por segundo en la misma prueba. No documenta llamadas a herramientas en la portada; sí gramáticas GBNF |
| **MLX Swift** (Apple) | MIT **[V]** | iOS y macOS; modelos de lenguaje y visión viven en un repo aparte `mlx-swift-lm` | Muy buena calidad en la prueba; consume más memoria |
| **WebLLM** (MLC) | Apache-2.0 **[V]** | **Navegador, sin servidor**, usa WebGPU; interfaz compatible con OpenAI y modo JSON | Llamadas a herramientas "en desarrollo". **[NV]** en Safari, aunque iOS 26+ tiene WebGPU (ver `VERIFICATION.md`) |
| **Apple Foundation Models** | Términos de Apple (no es software libre) | Swift, en dispositivos con Apple Intelligence **[V]**; llamadas a herramientas, salida estructurada, **imágenes** y servidor privado de Apple como respaldo; admite además cargar un modelo abierto propio **[V]** | Solo app nativa. **[NV]** costo, dispositivos exactos y límites |
| **MediaPipe LLM** | Apache-2.0 | — | En "solo mantenimiento"; Google recomienda LiteRT-LM **[V]** |
| ExecuTorch, MLC LLM nativo, Cactus | — | — | **[NV]** sin revisar: pendiente para colaboradores |

La comparación de velocidad es de [un repositorio de terceros (MIT)](https://github.com/john-rocky/apple-silicon-llm-bench) con un iPhone 17 Pro; el propio autor avisa de que las cifras de sesiones distintas no son comparables y de que el rendimiento baja 50–60 % con carga sostenida en GPU. **Las cifras no son nuestras; hay que medir en el iPhone del propietario.**

### APIs en la nube de otras compañías (con clave del usuario)

| Proveedor | Dirección base y formato | Herramientas e imágenes |
| --- | --- | --- |
| **Meta Model API** | `https://api.meta.ai/v1`; formato OpenAI y Anthropic **[V]** | Herramientas en paralelo; entiende imágenes **[V]** |
| **DeepSeek** | `https://api.deepseek.com` (OpenAI) y `.../anthropic` **[V]** | Herramientas: **[NV]** (la página no lo dice) |
| **Qwen / Alibaba** | `.../compatible-mode/v1` por región (Singapur, Virginia, Hong Kong, Tokio, Pekín); la clave es por región **[V]** | Herramientas sí (no con streaming a la vez); modelos de visión existen **[V]** |
| **Kimi / Moonshot** | `https://api.moonshot.ai/v1`; formato OpenAI y Anthropic **[V]** | Herramientas; imagen y video **[V]** |
| **GLM / Z.ai** | `https://api.z.ai/api/paas/v4/`; compatible con OpenAI **[V]** | Herramientas y visión: **[NV]** |

**Cautelas:** enviar fotogramas o texto del usuario a empresas de otros países tiene implicaciones de privacidad que el propietario debe conocer y aceptar, y hay que avisarlo en la pantalla de conexión. **[NV]** que cada API se pueda llamar desde el navegador (CORS).

## 2. Sin servidores: qué sí y qué no

**Lo que se puede hacer sin servidor propio (candidatos):**

| Necesidad | Opción | Licencia | Notas |
| --- | --- | --- | --- |
| Alojar la app web | Páginas estáticas (GitHub Pages) | — | Gratis. Pendiente de autorización del propietario |
| Editar un proyecto entre varias personas o dos teléfonos | **Yjs** (CRDT, "red-agnóstico", edición sin conexión con IndexedDB) | MIT **[V]** | Los cambios se mezclan sin conflictos |
| Que dos navegadores se encuentren sin servidor propio | **Trystero**: descubrimiento por BitTorrent, Nostr, MQTT, IPFS…; datos cifrados de punta a punta | MIT **[V]** | Hay redes que no permiten conexión directa y pueden necesitar un relevo (TURN); WebRTC limita las conexiones simultáneas **[V]** |
| Repartir paquetes, plantillas y pesos de modelos entre usuarios | **WebTorrent** (en el navegador por WebRTC) | MIT **[V]** | En el navegador solo se conecta con otros WebTorrent/WebRTC, no con clientes TCP/UDP **[V]** |
| Conectar dispositivos por clave pública (nativo) | **Iroh**: llamar por clave pública, perforar NAT, relevos públicos como respaldo | Apache-2.0 o MIT **[V]** | Escrito en Rust; iOS/Android/WASM: **[NV]** |
| Registro distribuido de datos | Hypercore | MIT **[V]** | Navegador/móvil: **[NV]** |

**Lo que no se puede evitar:**
- **Transmitir en vivo a Twitch, YouTube, Kick, etc.:** el servidor es el de la plataforma; AgentCut solo se conecta a él. No hay servidor nuestro que mantener.
- **Transmitir a varias plataformas a la vez:** o el teléfono sube el video varias veces, o hace falta un relevo (servidor). Lo gratuito sin servidor es lo primero, a costa de subida, batería y calor **[NV]**.
- **IA en la nube:** es un servicio de otra empresa (el usuario trae su clave). Sin nube, queda la IA local.
- **Transmisión directa a espectadores por P2P (WebRTC, WHIP):** que las plataformas grandes la acepten como entrada es **[NV]** (no encontré una fuente oficial legible).

**Cautela:** P2P no se improvisa. Cada conexión directa expone la dirección de red del usuario a la otra persona, y los archivos repartidos por P2P necesitan firmas para que nadie cuele uno falso. Cualquier prototipo debe pasar esa revisión antes de abrirse al público.

## 3. Video: editores y librerías abiertas

| Proyecto | Licencia | Qué es | Servicio para AgentCut |
| --- | --- | --- | --- |
| **Mediabunny** | MPL-2.0 | Leer/escribir MP4, MOV, WebM; recorte con copia sin recodificar solo si el inicio es cero **[V]** | Motor de exportación (plan B del issue #11) |
| **WebAV** | MIT **[V]** (clonado) | SDK de edición con WebCodecs; "Chrome 102+, Edge, Electron" **[V]**; no declara Safari | Referencia. Su versión de pago "Pro" existe: **no dependemos de ella** |
| **omniclip** | MIT en `LICENSE`, pero `package.json` dice ISC **[V]**: licencias compatibles entre sí, conviene aclarar con el autor | Editor completo en el navegador con WebCodecs y ffmpeg.wasm; línea de tiempo, texto, transiciones, exportación hasta 4K, colaboración por WebRTC **[V]** | Mejor referencia de arquitectura web **abierta**. Último cambio: 7 ago 2025, ~14 meses sin actividad; usa un "service worker" de aislamiento (`coi-serviceworker`) **[V]**. En móvil: **[NV]**. Se puede reutilizar código con su licencia MIT, citando autoría |
| **Revideo** | MIT **[V]** | Video con código (TypeScript); vista previa en el navegador, render en servidor | Poco útil sin servidor |
| **LosslessCut** | GPL-2.0 **[V]** | Cortes sin pérdida con FFmpeg, solo escritorio | Referencia de ideas; no se mezcla su código (copyleft) |
| **libopenshot** | LGPL-3.0 **[V]** | Biblioteca C++ de edición; solo Linux, Mac y Windows | Sin móvil |
| **ffmpeg.wasm** | MIT (envoltorio) | FFmpeg en el navegador | Pesado en móvil (ver `RESOURCES.md`); respaldo |
| **Media3 Transformer** (Android) | Apache-2.0 en los ejemplos **[V]** | Recorte, efectos y exportación con aceleración por hardware | Si hay app nativa de Android |
| OpenCut, Concat | MIT, AGPL-3.0 | Probados en el issue #1 | Solo referencia |

**Nota sobre dependencias que no traen código:** AVFoundation (iOS) y los codificadores del sistema son del fabricante; no se copian, se usan por su interfaz.

## 4. Orden de trabajo propuesto

1. Seguir con el prototipo "el chat edita de verdad" (PR #5 + `ARCHITECTURE.md`).
2. Añadir el proveedor de IA local como **un proveedor más** y medir en el iPhone con Gemma 4 E2B, Qwen 3.5 2B y WebLLM.
3. Prototipo mínimo de co-edición con Yjs + Trystero (dos teléfonos, mismo proyecto).
4. Después, lo nativo (gafas, transmisión).

Lo que está bloqueado o necesita manos queda en [`HELP_WANTED.md`](HELP_WANTED.md).

— Claude
