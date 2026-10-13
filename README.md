# AgentCut (working name)

**ES · Un editor de video para Android que una IA puede controlar desde un chat dentro de la propia app.**
**EN · An Android video editor that an AI can drive from a chat built into the app itself.**

> Estado / Status: **idea stage, looking for contributors.** Nothing here is built yet.
> Nombre provisional. Antes de publicar, revisar `TRADEMARK.md` de Concat para no usar su nombre.

---

## ¿Qué es? / What is it?

**ES.** Un fork de [Concat](https://github.com/jub0t/Concat) (editor de video libre, motor en Rust, alternativa a CapCut) con un panel de chat. Escribes "quita los silencios, ponle subtítulos y exporta vertical", la IA decide los pasos y la app los ejecuta **en tu teléfono**. No necesitas computadora.

**EN.** A fork of Concat (free, Rust-engine, CapCut-style editor) with a chat panel. You type "remove the silences, add captions, export vertical"; the AI plans the steps and the app runs them **on your phone**. No computer needed.

## Motivación / Motivation

**ES.** En la experiencia del autor, la IA que traen los editores móviles populares (como CapCut) es limitada: acciones y plantillas fijas. Aquí un modelo de primer nivel (primero Claude y ChatGPT; luego Meta y otros) maneja un motor de edición real: entiende instrucciones largas o vagas, aprende cómo trabaja el usuario y encadena muchas ediciones.

**EN.** In the author's experience, the AI built into popular mobile editors is limited to fixed actions and templates. Here a frontier model (Claude and ChatGPT first, then Meta and others) drives a real editing engine, so it can follow long or vague instructions and chain many edits.

## ¿Por qué así? / Why this design?

Una IA en la nube no puede "entrar" a una app de tu teléfono: el teléfono no tiene una dirección pública estable. Así que invertimos la dirección: **la app llama a la IA**, y la IA responde con llamadas a herramientas (tool calls) que la app ejecuta localmente.

A cloud AI cannot reach into an app on your phone. So we flip it: **the app calls the AI**, and the AI answers with tool calls the app runs locally.

```
┌──────────────── Android phone ────────────────┐
│  Chat panel ──► Agent loop ──► Tool layer     │
│        ▲            │               │         │
│        │            │               ▼         │
│        │            │        Concat engine    │
│        │            │   (project, media, edit,│
│        │            │    export, catalogue)   │
└────────┼────────────┼─────────────────────────┘
         │            ▼ (text + tool results only)
         │     AI provider (internet)
         └── Claude API · OpenAI-compatible APIs · local model (later)
```

- El video **no se sube**. Solo viajan texto y resultados de herramientas. (Si algún día se envían fotogramas para que la IA "vea", será opcional y claramente avisado.)
- Video stays on the device. Only text and tool results travel. Sending frames for vision, if added, must be opt-in.

## Herramientas que ve la IA / Tools the AI sees

Mapeadas a la API de Concat (`concat-api`). Nombres de la documentación de Concat v0.2:

| Tool | Concat method |
| --- | --- |
| `version` | `version` |
| `project_create` / `project_open` / `project_save` | `project.create`, `project.open`, `project.save` |
| `media_import` | `media.import` |
| `edit_apply` (one edit command) / batch | `edit.apply` |
| `catalogue_list` | `catalogue.list` |
| `export_run` | `export.run` (job + progress events) |

Reglas del bucle del agente / agent-loop rules:
1. Llamar `version` primero y leer `capabilities`.
2. Nunca adivinar ids de clips: leerlos del `EditorView` devuelto.
3. Una exportación a la vez (`busy` si hay otra).
4. Pedir confirmación al usuario antes de borrar, sobrescribir o exportar sobre un archivo existente.
5. Las herramientas solo pueden tocar la carpeta del proyecto.

## Proveedores de IA / AI providers

| Provider | How it connects | Notes |
| --- | --- | --- |
| Claude | Anthropic API, **API key** | Pay per use, separate from any chat subscription |
| OpenAI-compatible (incl. Meta Model API) | Base URL + API key | Meta's API was a U.S.-only public preview as of July 2026; check availability |
| Local small model | On-device | Later stage; small models still struggle to chain tools reliably |

**Sobre "iniciar sesión" / About "sign in":** as far as we know, chat subscriptions (Claude.ai, ChatGPT, Meta AI) do not give third-party apps access. Apps use an **API key** the user pastes in (stored in Android Keystore) or, where a provider offers it, OAuth. This needs to be verified per provider before building the login screen.

## Voces y audio gratuitos / Free voice proposal (later stage)

**Propuesta pendiente de aprobación del propietario, no implementada.** La preferencia expresada es disponer de narración, transcripción y subtítulos gratuitos y, cuando sea viable, con software y modelos de código abierto. Prioridad inmediata: **editor web táctil en Safari/Android que importa, corta, agrega texto y exporta un clip**. Las voces se investigarán después; se verificarán licencias de cada componente y límites del navegador. No se exige usar Concat ni una API de voz pagada.

**Revisión de opciones y pruebas pendientes:** [docs/VOICE_OPEN_SOURCE_POLICY.md](docs/VOICE_OPEN_SOURCE_POLICY.md).

## Plan por etapas / Roadmap

La capa de agente (chat, bucle, proveedores) es **independiente del motor**: cada motor de edición entra como un adaptador que ofrece las mismas herramientas. / The agent layer (chat, loop, providers) is engine-agnostic: each editing engine plugs in as an adapter exposing the same tools.

- **M0a — Web first (works on iPhone, no computer):** adaptador para un editor web libre (candidato: OpenCut clásico, MIT) que corre en Safari, sin instalar nada. Verificar rendimiento y exportación con video real en iPhone; límites de Safari en segundo plano.
- **M0b — Concat on Android:** Concat builds and runs on an Android device from the fork. Find out whether the engine API (JSON-RPC types in `concat-api`) can be called **in-process** on Android. Compilar en la nube (GitHub Actions) y descargar el APK desde el celular.
- **iPhone nativo (Concat):** marcado "por probar" por Concat; instalar fuera de la App Store suele requerir una computadora al menos una vez. Fuera de alcance al inicio.
- **M1 — Chat + 6 tools:** panel de chat, bucle del agente, herramientas de la tabla, un solo proveedor (Claude).
- **M2 — More providers:** adaptador OpenAI-compatible, selector de proveedor, almacenamiento seguro de claves.
- **M3 — Creator tools:** quitar silencios, subtítulos (Whisper local de Concat), exportación vertical 9:16.
- **M4 — Podcast video:** plantilla de video de podcast (audio + onda/subtítulos + fondo).
- **M5 — Live (research):** transmisión en vivo desde gafas Ray-Ban Meta. Hay que investigar qué permite el SDK/API de Meta antes de prometer nada.
- **M6 — Local model:** modelo pequeño en el teléfono, sin internet.

## Preguntas abiertas / Open questions

1. ¿Expone la versión de Android la API del motor sin ventana? / Does the Android build expose the engine API?
2. ¿Qué tan bien encadena herramientas un modelo local pequeño? / How reliable are small local models at tool use?
3. ¿Qué permite Meta para apps de terceros con las gafas? / What does Meta allow third-party apps to do with the glasses?
4. ¿Se puede contribuir un servidor MCP al proyecto original? / Can an MCP server be upstreamed to Concat? (Concat's docs list MCP as planned, not shipped.)

## Se buscan manos / Help wanted

Rust, Kotlin/Android (Compose), diseño de agentes con herramientas, pruebas en dispositivos reales, traducciones.

## Licencia / License

Concat es **AGPL-3.0-or-later**; este fork hereda esa licencia. Un programa que solo habla con Concat por su API es un cliente; ver `LICENSE-EXCEPTIONS.md` de Concat.
Concat is AGPL-3.0-or-later; this fork inherits it.
