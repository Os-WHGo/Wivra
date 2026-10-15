# Wivra

**ES · Un editor de video para el teléfono (iPhone y Android), en el navegador, que una IA controla desde un chat.**
**EN · A phone-first video editor, in the browser, that an AI drives from a chat.**

> Estado / Status: **idea stage, looking for contributors.** Nothing here is built yet.
> Nombre: **Wivra** (antes "AgentCut"; renombrado el 13-10-2026 por decisión del propietario; el repositorio se renombra en GitHub a `wivra`). Pendiente: comprobar que no choque con marcas existentes antes de publicar.

---

## La idea / The idea

**ES.** Hoy los agentes de IA que manejan aplicaciones lo hacen casi siempre en computadoras de escritorio. Hasta donde sabemos, no hay un editor de video pensado para el teléfono que una IA pueda controlar así (no verificado de forma exhaustiva; si conoces uno, abre un issue). AgentCut quiere aprovechar la potencia que ya tienen los teléfonos: tú escribes "quita los silencios, ponle subtítulos y exporta vertical", la IA decide los pasos y el editor los ejecuta **en tu teléfono**. Sin computadora, sin instalar nada.

**EN.** (Architecture is open: web-first is only a proposal, see `docs/ARCHITECTURE.md`.) AI agents that operate apps today mostly do it on desktop computers. As far as we know, there is no phone-first video editor that an AI can drive this way (not exhaustively verified; open an issue if you know one). AgentCut wants to use the power phones already have: you type "remove the silences, add captions, export vertical", the AI plans the steps and the editor runs them **on your phone**. No computer, no install.

## Cómo funciona / How it works

- **Arquitectura: en discusión.** El propietario no ha decidido que sea solo web. La propuesta técnica (web primero, cápsula nativa después para gafas y transmisión en vivo, comparada con las otras opciones) está en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Hoy lo más fácil de probar desde un iPhone, sin computadora, es una página web: importar video de la galería, cortar, poner texto y exportar.
- **Chat dentro de la app:** la app llama a la IA y la IA responde con llamadas a herramientas (tool calls) que la app ejecuta localmente. Una IA en la nube no puede "entrar" a una página de tu teléfono, así que invertimos la dirección.
- **El video no se sube.** Solo viajan texto y resultados de herramientas. Enviar fotogramas para que la IA "vea" sería opcional y avisado.

```
┌──────────────── Teléfono (navegador) ─────────────┐
│  Chat ──► Bucle del agente ──► Capa de herramientas│
│    ▲              │                    │           │
│    │              │                    ▼           │
│    │              │          Editor propio (web)   │
│    │              │   (proyecto, medios, edición,  │
│    │              │        exportación)            │
└────┼──────────────┼────────────────────────────────┘
     │              ▼ (solo texto y resultados)
     │       Proveedor de IA (internet)
     └── Claude · ChatGPT · Meta · otros · modelo local (más adelante)
```

Reutilizamos todo lo que sea posible y legal (código abierto, gratis, APIs), verificando la licencia de cada pieza. **No copiamos código, imágenes ni marca de CapCut ni de otras apps propietarias.**

## Enfoque: crear reels y contenido / Focus: creator content

**ES.** Wivra está pensado para que crear reels y contenido sea mucho más fácil, usando todas las herramientas de IA que sea posible:
- **Reconocer:** texto en pantalla (carteles, nombres de calles), lugares (apoyándose en el GPS del video cuando exista), momentos clave y silencios. Los modelos con visión leen texto en los fotogramas, pero la precisión varía y hay que verificarla. No identificamos personas por su cara.
- **Sugerir ideas:** ganchos de apertura, títulos, estructura del reel, guiones y hashtags a partir de lo que aparece en los videos.
- **Teleprompter:** el guion se desplaza en pantalla mientras grabas, con velocidad ajustable.
- **Cualquier IA:** una capa de proveedores intercambiable (Claude, ChatGPT/OpenAI y compatibles, Gemini, Meta y otros). Cada persona trae su propia clave.
- **Privacidad y costo:** el video queda en el teléfono; solo se envían unos fotogramas y texto, con permiso, y se muestra una estimación del costo antes de analizar.

**EN.** Wivra aims to make creating reels and content much easier by using as many AI tools as possible: recognizing on-screen text and places (verified, never faces), suggesting hooks, titles and scripts, a teleprompter for recording, and an interchangeable provider layer (Claude, OpenAI-compatible, Gemini, Meta, others). Video stays on the phone; only a few frames and text are sent, with permission and a cost estimate.

## Herramientas que ve la IA / Tools the AI sees

Contrato independiente del motor (se detalla en el issue #3):

| Tool | Qué hace / What it does |
| --- | --- |
| `project_create` / `project_open` / `project_save` | Gestionar el proyecto |
| `media_import` | Añadir un video, foto o audio al proyecto |
| `edit_apply` (uno o por lotes) | Aplicar una edición: cortar, recortar, mover, texto, volumen |
| `catalogue_list` | Listar los efectos y plantillas disponibles |
| `export_run` | Exportar el video (con progreso) |

Reglas del bucle del agente / agent-loop rules:
1. Nunca adivinar ids de clips: leerlos del estado devuelto por el editor.
2. Una exportación a la vez.
3. Pedir confirmación al usuario antes de borrar, sobrescribir o exportar sobre un archivo existente.
4. Las herramientas solo tocan el proyecto actual.

## Proveedores de IA / AI providers

| Proveedor | Cómo se conecta | Notas |
| --- | --- | --- |
| Claude | API de Anthropic, **clave de API** | Se paga por uso, aparte de cualquier suscripción de chat |
| ChatGPT / compatibles con OpenAI | URL base + clave de API | Verificar condiciones de uso desde el navegador |
| Meta | API de modelos de Meta | En julio de 2026 era una vista previa solo para EE. UU.; verificar disponibilidad |
| Gemini y otros | API del proveedor, mediante un adaptador | Cada proveedor tiene su propio formato de herramientas e imágenes; el adaptador lo oculta |
| Modelo local pequeño | En el dispositivo | Etapa tardía; los modelos pequeños aún fallan al encadenar herramientas |

**Sobre "iniciar sesión" / About "sign in":** hasta donde sabemos, las suscripciones de chat (Claude.ai, ChatGPT, Meta AI) no dan acceso a apps de terceros. Las apps usan una **clave de API** que la persona pega, o, si un proveedor lo ofrece, OAuth. La clave se guarda solo en el dispositivo. Hay que verificarlo por proveedor antes de construir la pantalla de conexión.

## Plan por etapas / Roadmap

- **M0 — Prototipo web mínimo:** abrir desde el teléfono, importar un video de Fotos, línea de tiempo simple (dividir y recortar), texto y exportar MP4. Probar en iPhone y en Android. La pregunta clave es qué aguanta el navegador del teléfono (decodificar y exportar video, memoria, pantalla bloqueada).
- **M1 — Chat + herramientas:** panel de chat, bucle del agente, herramientas de la tabla, un solo proveedor (Claude).
- **M2 — Más proveedores:** ChatGPT, Meta cuando esté disponible, selector de proveedor.
- **M3 — Herramientas de creador:** quitar silencios, subtítulos, exportación vertical 9:16.
- **M3b — Análisis de video y asistente de contenido:** sacar fotogramas y transcripción en el teléfono, reconocer texto y lugares, sugerir ideas y guiones (issue #6).
- **M3c — Teleprompter:** guion que se desplaza mientras grabas (issue #7).
- **M4 — Video de podcast:** plantilla (audio + onda o subtítulos + fondo).
- **M5 — En vivo (investigación):** transmisión desde gafas Ray-Ban Meta. Hay que investigar qué permite Meta antes de prometer nada.
- **M6 — Modelo local:** un modelo pequeño en el teléfono, sin internet.

**Referencias, no dependencias:** [OpenCut](https://github.com/OpenCut-app/OpenCut) (MIT) y [Concat](https://github.com/jub0t/Concat) (AGPL-3.0) son editores abiertos que sirven de inspiración técnica. En la prueba del issue #1, OpenCut cargó e importó en un iPhone, pero el clip no se quedó en la línea de tiempo con el dedo.

## Preguntas abiertas / Open questions

1. ¿Qué APIs del navegador sirven para decodificar y exportar video en iPhone y Android? / Which browser APIs can decode and encode video on iPhone and Android?
2. ¿Dónde se aloja la app (hosting estático)? / Where is the app hosted (static hosting)?
3. ¿Puede la página llamar directamente a las APIs de los proveedores de IA, o hace falta un pequeño intermediario? / Can the page call AI provider APIs directly, or is a small proxy needed?
4. ¿Cómo encadenan herramientas los modelos locales pequeños? / How reliable are small local models at tool use?
5. ¿Qué permite Meta a apps de terceros con las gafas? / What does Meta allow third-party apps to do with the glasses?
6. ¿Qué licencia tendrá el código nuevo? Decisión del propietario del repo. / Which license for the new code? Owner's decision.

## Cómo trabajamos / How we work

- El **propietario del repo decide**. Las IAs colaboradoras proponen opciones con pros y contras; no declaran reglas "no negociables".
- Todo cambio va en un **pull request en borrador**. Nada se fusiona a `main` sin revisión del propietario.
- Cada dato se marca como **verificado (con fuente)** o **no verificado**.
- Primero lo que funciona en un teléfono real; después la documentación extra.
- Los comentarios y commits se firman con el nombre de quien los escribe (Claude, ChatGPT, etc.), porque todos usan la misma cuenta de GitHub.

## Se buscan manos / Help wanted

Lista de tareas detenidas y qué falta en cada una: [`docs/HELP_WANTED.md`](docs/HELP_WANTED.md).

JavaScript/TypeScript y APIs de video del navegador (WebCodecs, WebAssembly), diseño táctil móvil, agentes con herramientas, pruebas en iPhone y Android reales, traducciones.

## Licencia / License

Por decidir. / To be decided.
