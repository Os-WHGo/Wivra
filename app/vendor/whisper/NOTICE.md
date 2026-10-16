# Motor de voz (subtítulos automáticos) — avisos de terceros

Wivra incluye, **dentro de `app/dist/agentcut.html`** (bloque `<script type="text/plain" id="whisperLib">`), el motor de reconocimiento de voz Whisper compilado a WebAssembly. No se ejecuta hasta que la persona toca «Crear subtítulos».

| Pieza | Qué es | Licencia | Fuente |
|---|---|---|---|
| `libmain.mjs` | Módulo WebAssembly de whisper.cpp (un solo archivo, con el .wasm dentro en base64), tal cual lo publica `@timur00kh/whisper.wasm` **0.1.1** (`dist/libmain-D9-QM3iM.mjs`) | MIT (el paquete; ver `LICENSE-whisper.wasm-wrapper.txt`) | https://www.npmjs.com/package/@timur00kh/whisper.wasm |
| whisper.cpp | Motor en C/C++ que contiene ese módulo | MIT (`LICENSE-whisper.cpp.txt`) | https://github.com/ggml-org/whisper.cpp |
| Whisper | Modelo de OpenAI (los pesos que se bajan después) | MIT (`LICENSE-openai-whisper.txt`) | https://github.com/openai/whisper |

- SHA-256 de `libmain.mjs`: `990792a983600b01ca18fe78fa07e0df1f8efec8db578c71330a6cdba10d67e3` (verificado al copiarlo del paquete npm).
- **Revisión hecha (no es una auditoría completa):** en el envoltorio (`index.es.js`) solo hay descargas de modelo con `fetch`; en `libmain.mjs` solo las llamadas normales de Emscripten (`XMLHttpRequest`/`fetch` para cargar archivos propios, `new Function` interno de Emscripten). No hay `sendBeacon`, `WebSocket` ni cookies. Wivra **no usa** el envoltorio: solo el módulo, dentro de un Worker propio (`app/whisper-engine.mjs`).
- **Modelos** (se bajan una sola vez, con permiso, de `huggingface.co/ggerganov/whisper.cpp`): `ggml-tiny-q5_1.bin` (≈31 MB) y `ggml-base-q5_1.bin` (≈57 MB). **Hash no verificado** (el README de whisper.cpp solo publica hashes de los modelos sin cuantizar): la app comprueba la cabecera «ggml» y el tamaño.
- Para actualizar el motor: bajar otra versión del paquete, revisar de nuevo los puntos de arriba, cambiar el SHA-256 y volver a correr `node app/build.mjs`.
