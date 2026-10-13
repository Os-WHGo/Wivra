# AgentCut · agentes con acceso LOCAL autorizado + IRL offline/online
**Actualización funcional 13 oct 2026 · — ChatGPT**  
**Estado:** propuesta de arquitectura + prueba real de código para marcas de video importado (carpeta `irl/`). **Ni IA local ni streaming ni grabación integrada están implementados.** Pendiente de revisión de Claude y decisión del propietario. Este PR no modifica `main`.

## La intención del propietario, corregida

El propietario **no eligió un editor exclusivamente web**. Quiere **un producto centrado en iPhone y Android**, accesible sin gran hardware ni contratación de editores, con:
1. **IRL vivo:** cámara del teléfono o Ray-Ban Meta → uno o varios destinos autorizados (Twitch, Kick, YouTube, TikTok, Facebook Live, Instagram y otros), con estado de red y **grabación local mientras emite**.
2. **IRL offline:** salir a grabar sin emitir ni gastar datos, con cronología/marcas, como un falso directo; al terminar, revisar momentos y generar contenido.
3. **Biblioteca local**: grabaciones antiguas de la cámara o Meta, o repeticiones propias importadas desde las plataformas, indexadas y tratadas en el dispositivo.
4. **Agente editor y creador**: Claude, ChatGPT/OpenAI, Muse/Meta u otras IA que interpreten instrucciones y ordenen **herramientas de edición reales**, sin fingir que la IA puede tocar directamente cualquier archivo del teléfono; IA local opcional, modelos ligeros y prioridad de batería/memoria/espacio. Al acabar LIVE u offline, proponer highlights revisables y exportar formatos para Reels, Shorts, TikTok e historias.
5. **Calidad honesta**: conservar fuente, evitar recompresión innecesaria, proxies para navegar, H.264/HEVC/AV1 según hardware y compatibilidad, medir en clips antes de comprimir lotes; no etiquetar 4K reescalado como 4K de captura.

**Proyectos relacionados:** [PR #4 voz](https://github.com/Os-WHGo/agentcut/pull/4), [PR #5 editor web](https://github.com/Os-WHGo/agentcut/pull/5), [PR #9 recursos Claude](https://github.com/Os-WHGo/agentcut/pull/9), [PR #12 streaming+Muse](https://github.com/Os-WHGo/agentcut/pull/12), [PR #13 arquitectura Claude](https://github.com/Os-WHGo/agentcut/pull/13), [PR #17 eficiencia móvil](https://github.com/Os-WHGo/agentcut/pull/17), [PR #16 verificaciones Claude](https://github.com/Os-WHGo/agentcut/pull/16). No duplicar código ni sobrescribir sus ramas.

## ¿Los agentes pueden usar archivos locales? SÍ, con un intermediario de permisos

```
Usuario autoriza Fotos/Archivos/carpeta/proyecto
                ↓
       Local MediaBroker (solo dispositivo)
          ├── catálogo: asset_id, metadatos, tiempos, hashes
          ├── lectura de fotogramas/sonido, reproducción, transcripción
          ├── anotaciones, proxies y timeline reproducible
          └── exportación → destino local aprobado
                ↑
      AgentCut Tool Executor + Validation + User Confirm
                ↑
       AI Agent / Chat / offline assistant
          ├── Local: llama.cpp / Whisper / OCR / VAD (candidatos)
          └── Cloud: Claude/OpenAI/Meta, SOLO texto/metadatos
                       permitidos; imágenes/audio solo opt-in
```

**Principio funcional:** El agente NO recibe una ruta de sistema indiscriminada ni acceso a toda la galería. El usuario abre archivos o selecciona una carpeta y AgentCut crea identificadores del proyecto. Las herramientas solo admiten `asset_id` autorizados. Acceder a **todo el contenido** de un archivo, exportar, compartir, transmitir o borrar son capacidades separadas. Un modelo comercial remoto NO puede leer por sí solo los bytes almacenados en un teléfono, salvo que la app los extraiga y los envíe expresamente. Transcripciones y metadatos también pueden ser sensibles: consentimiento granular para mandarlos fuera.

**Hechos verificados**:
- iOS nativo permite seleccionar una carpeta mediante `UIDocumentPickerViewController` y obtener URLs *security-scoped* restringidas; acceso y marcadores requieren gestionar permisos de modo explícito: [Apple](https://developer.apple.com/documentation/uikit/providing-access-to-directories).
- Android usa `ACTION_OPEN_DOCUMENT` / Storage Access Framework para documentos/ficheros otorgados por el usuario: [Android](https://developer.android.com/training/data-storage/shared/documents-files).
- El navegador permite selección explícita con `<input type=file>`; **NO** concede exploración silenciosa de Fotos ni acceso persistente a todas las carpetas. Persistencia/biblioteca de iOS Safari deben verificarse en hardware.
- DAT oficial de Meta conecta **apps nativas** iOS/Android con gafas compatibles, y sus capacidades/políticas requieren revisión por versión: [Meta](https://developers.meta.com/wearables/faq/). No equivale a permiso de toda la galería de las gafas.

## Contrato de permisos propuesto (NO implementado)

| Nivel | Agente puede hacer | Autorización |
| --- | --- | --- |
| `media.list_project` | Enumerar activos **del proyecto**, no la fototeca completa | Abrir carpeta/proyecto |
| `media.inspect` | Duración, códec, resolución, timecodes | Ya seleccionado |
| `media.analyze_local` | Extraer cuadros/transcripciones en teléfono | Aprobado para ese proyecto |
| `ai.send_context` | Enviar texto/miniaturas/transcripciones fuera | **Opt-in** por solicitud; mostrar qué se envía |
| `edit.plan` | Preparar cortes, subtítulos, efectos, orden de escenas | No modifica archivos |
| `edit.apply` | Modificar timeline de proyecto, reversible | Dentro del proyecto; revisión cuando corresponda |
| `export.local` | Escribir archivo final en destino aprobado | Confirmar ruta y sobrescritura |
| `live.start` | Emitir AV a plataformas autorizadas | **Botón humano expreso** siempre |
| `media.delete_original` | Borrar original de Fotos/Archivos | **Fuera del alcance del MVP**; nunca por agente autónomo |

**Tokens propuestos** por función, con `scope=project_id`, `asset_ids`, `expiry`, `max_bytes`, `allow_network=false`, `allow_remote_frames=false`. Estos campos son un **diseño, no algo que exista ya**. Auditar cada operación en el dispositivo y presentar un historial legible con deshacer cuando sea posible. No exponer nunca claves de APIs/RTMP a la IA.

## Offline IRL: cómo usarlo con recursos mínimos

Modo ideal futuro: abrir AgentCut → cámara teléfono/Meta (si DAT permitido) → `Grabar IRL offline` → botón «Marcar momento» mientras se camina → detener → guardar archivo **localmente** → generar automáticamente proyectos y sugerencias. **Sin streaming** ni gasto en servidor ni redes.

**Prototipo incluido aquí** `irl/index.html`:
- Seleccionas **un video que YA grabaste** con móvil o gafas. No inicia cámara ni emite.
- Lo reproduces y marcas segundos exactos de momentos interesantes.
- `irl/irl-project.mjs` agrupa marcas cercanas, propone ventanas (7 s antes / 12 s después) sin afirmar que IA haya visto el contenido, y guarda un JSON descargable con marcadores y propuesta.
- El archivo original no se modifica, copia, exporta ni sube; **el proyecto JSON no incluye el video**. Usuario debe conservarlo. El JSON todavía NO puede abrirse en el editor: formato experimental que requiere integración.
- No hay almacenamiento persistente en app al cerrar, ni segmentación recuperable, ni grabación, ni cloud AI, ni modelos locales. Necesita un despliegue estático temporal (sin fusionar main) para funcionar correctamente como página web en móvil. **No se ha probado en iPhone real**.
- Tests: `node --test irl/tests/irl-project.test.mjs`. Al publicarse el PR, Actions corre los tests automáticamente. **Una prueba de Node NO demuestra compatibilidad Safari.**

## Live low-cost: decisión abierta, sin mentiras

- Si un teléfono emite **una sola** señal a destino, puede guardar el mismo flujo codificado localmente, reduciendo coste de codificación doble. Verificar audio/video/timing y seguridad de archivo.
- Para varios destinos: (A) enviar uno por destino aumenta consumo de subida; (B) un *relay* redistribuye una sola señal desde el teléfono, ahorrando datos móviles pero requiere servidor/ancho de banda, **no necesariamente gratis**. Software de relay como [MediaMTX](https://github.com/bluenviron/mediamtx) (MIT verificada) y [SRS](https://github.com/ossrs/srs) (MIT verificada).
- El directo **sale del teléfono** hacia los destinos que el usuario elige. En edición local no debe enviarse el video a ningún servidor de forma automática.
- Guardar local primero, usar VOD de YouTube/TikTok/Twitch/Facebook/Kick como posible copia adicional **solo si la cuenta/plataforma lo permite**. Algunas expiran; recuperación por APIs oficial o importación de la descarga manual, caso por caso. No eludir permisos ni prometer acceso a VOD mediante rutas privadas.
- Simultaneidad de codecs/calidad: primero un stream H.264/AAC estable donde sea compatible, grabación local igual si segundo encoder satura dispositivo; HEVC posterior o separado solo después de pruebas. Depende de red/permiso/publicación de plataforma. Sin hardware/servidor grandes para el usuario final, pero compilar app iOS nativa normalmente implica Mac/Xcode o CI de compilación más firma, y un relay multistream consume recursos de algún servidor.
- Priorizar 720p/1080p fluidos sobre "4K" sin fuente real y bitrate suficiente. Meta DAT resolución permitida en cámara de gafas no debe confundirse con 4K nativo.

## IA local y abierta: candidatos evaluables, NO lista de funciones implementadas

| Runtime/proyecto | Función en el móvil | Licencia de repo verificada (GitHub, 2026-10-13) | Problema pendiente |
| --- | --- | --- | --- |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | LLM pequeño, planeación local y selección de herramientas simples | MIT | Elegir **modelo/pesos** con licencia y tamaño adecuados; evaluar memoria/batería/calidad de tool calling |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Voz a texto/transcripción local | MIT | Rendimiento, idiomas, tiempos y peso del modelo |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Inferencia móvil para VAD, visión/OCR y modelos ligeros | MIT | Modelos/dependencias/licencias independientes |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Inferencia de modelos en web según soporte del navegador | Apache-2.0 | RAM, modelos y rendimiento Safari, no probado |
| [Moblin](https://github.com/eerimoq/moblin) | **Referencia de IRL en iPhone**, cámara/streaming y controles | MIT | Reutilización técnica y compatibilidad gafas requieren pruebas. No es modelo IA |

**Diseño del agente:** Procesamiento escalonado: índice y marcas manuales inmediatamente → VAD/audio en segundo plano si el dispositivo puede → transcripción de tramos seleccionados → visión solo para clips candidatos y fotogramas representativos → IA local/externa produce **plan de edición estructurado** que ejecuta un motor determinista local. Nunca asumir «descarga modelo grande y procesa cientos de videos gratis» en un iPhone con poca RAM. Medir y ofrecer modo ahorro.

## Qué debe coordinar Claude

1. Elegir el primer flujo de **acceso a archivos desde teléfono** a verificar: carpeta nativa con permisos o selector de archivos web, sin confundir uno con decisión final de arquitectura.
2. Priorizar integración incremental de `irl/irl-project.mjs` con la línea de tiempo del [PR #5](https://github.com/Os-WHGo/agentcut/pull/5): **importar video → marcar 3 instantes → ver 3 candidatos → exportar al menos uno**, sin IA ni servidor. Reutilizar proyectos JSON reales, validar ids/timecodes.
3. Hacer demo de **grabación offline directa** de 1 minuto en un dispositivo real antes de agregar streaming y gafas, con recuperación y guardado local.
4. Probar una IA local diminuta o VAD para sugerir un momento **a partir del contenido real**, diferenciando claramente las sugerencias generadas por marcadores.
5. En paralelo investigar DAT Meta y encoder/relay, conservando Cloud AI opcional por proveedor y permisos explícitos.
6. Registrar resultados de hardware, bugs y límites de Safari/Android en GitHub. Ningún PR se fusiona por los agentes.

**Nota para el propietario:** el objetivo no es pagar a un editor, sino ahorrar tiempo y usar componentes abiertos. Pueden existir costos opcionales de API IA, ancho de banda, firmas iOS o servidor relay; no prometer "todo en nube gratis" o calidad 4K irreal.

— ChatGPT
