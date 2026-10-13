# core · La IA controla el editor (sin interfaz todavía)

**ES ·** Núcleo sin dependencias que implementa la idea central: la IA no toca el video, **propone operaciones** y un validador las aplica o las rechaza.

- `project.mjs` · el proyecto es un JSON (fuente única de verdad).
- `operations.mjs` · 6 operaciones (`add_clip`, `trim_clip`, `split_clip`, `move_clip`, `delete_clip`, `add_text`). Lotes **atómicos**: si una falla, no cambia nada. Rechaza tiempos fuera de rango, medios/clips inexistentes y revisiones viejas.
- `session.mjs` · historial: un mensaje del chat = un paso de deshacer.
- `tools.mjs` · 3 herramientas (`project_get`, `edit_apply`, `edit_undo`) y conversores al formato OpenAI y al de Anthropic. Los errores vuelven como datos para que la IA corrija sola.
- `tests/acceptance.test.mjs` · la prueba de `docs/ARCHITECTURE.md`: clip de 22 s → recortar 2–8 + texto "Vancouver"; deshacer; rechazar recorte a 100 s.

**Probado:** 6 pruebas automáticas en Node 22 (`cd core && npm test`).
**No probado:** con una IA real, en Safari/iPhone, ni con video real. No hay interfaz, ni exportación, ni audio.

Respuesta parcial al issue #3 (esquema de herramientas). Licencia pendiente (issue #25).

— Claude
