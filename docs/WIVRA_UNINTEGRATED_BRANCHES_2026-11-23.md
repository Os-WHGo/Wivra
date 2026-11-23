# Ramas con código no integrado en la rama activa (2026-11-23)

> Inventario de Claude. **Nada se ha borrado:** todas estas ramas siguen en GitHub. Solo indica qué código de cada una no existe en `claude/wivra-separation-autonomy-1eyzht` (que contiene `main`, W110 y todas las ramas W54–W110 de ChatGPT, W64–W109 de Claude y las de Codex). Integrar o descartar cada una lo decide el propietario.

**Método (verificado):** historia completa de GitHub; `git merge-base --is-ancestor` para 201 ramas `claude/*`, `chatgpt/*` y `codex/*`. 149 están incluidas. Para las 52 restantes se listaron los archivos añadidos o modificados desde su base común que **no existen** en la rama activa. Las ramas que solo tenían documentación o commits equivalentes no se listan.

| Rama (fecha) | Código ausente | Estado probable |
| --- | --- | --- |
| `claude/license-mit` (13-10) | `LICENSE` (MIT) | **Decisión pendiente del propietario.** El README dice "Licencia: por decidir"; issue #25. No se añade sin confirmar. |
| `claude/beta-editor-integration` (16-10) | `app/transcribe.mjs`, `app/whisper-engine.mjs`, vendor whisper | Superado por W86 (`app/ai/whisper-wasm.mjs`, whisper.cpp). |
| `chatgpt/live-b2-scene-deck`, `live-b2b-native-preview-studio`, `live-b2c-community-alert-routing` (14/15-10) | `streaming/live/scene-deck.mjs`, `community-bus.mjs`, `obs-control-planner.mjs`, iOS `WivraLiveNativeSceneLab.swift`, `WivraLiveCommunityPanel.swift` y sus tests | Escenas: en parte superado por `core/live-scenes.mjs` (W63). **Alertas de comunidad y control de OBS: no existen hoy**, pendiente. |
| `chatgpt/universal-camera-adapters` (13-10) | `streaming/camera-source-registry.mjs` | Probablemente superado por `core/source-capabilities.mjs`. |
| `chatgpt/wivra-voice-studio-tts-adapter` (16-10) | `streaming/voice-studio-provider.mjs` (TTS opcional) | No existe hoy; pendiente (relacionado con issue #117). |
| `chatgpt/wivra-android-audio-provenance` (16-10) | `streaming/tests/android-phone-audio-provenance.test.mjs`, contrato WAV | Procedencia cubierta en parte por los tests de origen unificado; contrato propio no integrado. |
| `claude/ai-keys-and-local-models` (13-10) | `backend/ai-proxy/worker.mjs` | Intermediario de claves de IA para producción; pendiente (issue #8). |
| `chatgpt/mobile-agent-editor`, `web-mobile-editor-spike`, `irl-offline-local-spike`, `mobile-quality-lab` (13-10) | `web/`, `irl/`, `quality/` | Prototipos tempranos, superados por el editor único `app/`. |
| `claude/opencut-evaluation` (13-10) | `patches/opencut-classic/…` | Evaluación descartada (ver docs de arquitectura). |
| `claude/skills-external` | `.claude/skills/jake-*` (terceros) | Pendiente de revisar licencias antes de integrar. |

Las demás ramas no incluidas solo aportaban documentos de auditoría o cambios ya presentes con otro identificador.
