# W86 · Subtítulos automáticos en el teléfono (whisper.cpp + WebAssembly)

— Claude, 06-11-2026. Opción A elegida por el propietario: whisper.cpp multilingüe por WebAssembly, dentro del editor único y con los contratos de transcripción que ya existían. No hay un segundo sistema de subtítulos.

## Qué hace

1. En **Texto → Subtítulos automáticos (en el teléfono)** la persona elige el paquete de voz (**Preciso** = Base multilingüe Q5_1, ~57 MB, o **Ligero** = Tiny multilingüe Q5_1, ~31 MB) y el idioma del audio (o «Detectar idioma»).
2. **Descargar paquete de voz**: pregunta antes (tamaño, origen, «tu audio no se envía», Wi‑Fi recomendado). Nunca se descarga al instalar ni de forma automática.
3. El paquete se verifica (bytes + SHA‑256 fijados en el código) y se guarda en el teléfono (IndexedDB). Desde ahí funciona **sin Internet**. Se puede borrar.
4. **Generar subtítulos**: lee el sonido del video (la mezcla del timeline), lo corta en trozos de ~30 s en las pausas, y el motor los escucha en un Worker (el editor no se congela). Hay barra de progreso y **Cancelar** en cualquier etapa.
5. El resultado pasa por el contrato de transcripción existente (`validateTranscript`) y se convierte en **textos normales** del proyecto (`add_text`): se corrigen uno por uno, se mueven, se les cambia el estilo, se guardan como .srt/.vtt y salen en el video exportado. Antes de agregarlos pregunta, y se puede deshacer.
6. La importación de .srt/.vtt y de JSON de whisper.cpp sigue igual, como alternativa segura.

## Piezas (licencias)

| Pieza | Dónde | Licencia | Estado |
|---|---|---|---|
| whisper.cpp (commit `0c7be69…`) compilado a un solo módulo WebAssembly (SIMD, 1 hilo) con Emscripten 3.1.74 | `app/vendor/whisper/wivra-whisper.js` | MIT (`app/vendor/whisper/LICENSE-whisper.cpp.txt`) | **verificado**: el CI lo vuelve a compilar y exige que sea idéntico byte a byte |
| Puente mínimo C++ → JS | `tools/whisper-wasm/wivra_whisper.cpp` | del repositorio | verificado en CI |
| Modelos multilingües Q5_1 (Tiny 32 152 673 bytes, Base 59 707 625 bytes) del repositorio oficial `ggerganov/whisper.cpp` en Hugging Face, revisión `5359861` | se descargan con consentimiento | MIT según OpenAI Whisper y la ficha del repositorio (**no verificado** hoy de nuevo) | bytes y SHA‑256 **verificados** (medidos en CI y fijados en `app/ai/whisper-wasm.mjs`) |

Un solo hilo porque las WebView que cargan `file://` no tienen SharedArrayBuffer (sin cabeceras COOP/COEP). Sin modelos solo-inglés.

## Seguridad y memoria

- El motor va incrustado (comprimido) en el editor; el build y el teléfono comprueban su SHA‑256 antes de usarlo.
- El paquete descargado se comprueba al guardarlo y otra vez antes de cada uso; si está dañado se borra y se avisa.
- Mientras reconoce, el editor bloquea la red de la prueba: el audio no sale del teléfono.
- Límite por trabajo: **10 min de video** (el pico de memoria es decodificar el sonido del video). Para más, importar .srt/.vtt. Se ajustará con las pruebas físicas.
- Si el motor se queda sin memoria: mensaje claro y sugerencia de usar «Ligero» o un video más corto. Nada se agrega a medias: un trozo con error detiene todo.
- Grabación, LIVE y exportación no se tocan: el motor vive en un Worker que se cierra al terminar o cancelar.

## iPhone: arreglo de diálogos (afecta a todo el editor)

WKWebView respondía «Cancelar» a todos los `confirm()` y no mostraba `alert()`/`prompt()` porque la app no los implementaba. Ahora el editor del iPhone muestra diálogos nativos (Aceptar/Cancelar en 8 idiomas), solo para el editor incluido en la app. Esto también arregla borrar/renombrar proyectos y otras confirmaciones del editor en iPhone. **No verificado en un iPhone físico.**

## Pruebas automáticas (CI: «Wivra Whisper WASM»)

Un mismo guion dentro de la página (`tools/whisper-wasm/e2e-driver.js`) pulsa los mismos botones que una persona en tres motores:

| Dónde | Qué se prueba |
|---|---|
| Node (Linux) | Base vs Tiny: tiempo y % de palabras correctas en inglés (voz real) y español (voz sintética espeak-ng) |
| Chromium (Linux) | flujo completo + recarga **sin red**: el paquete sigue y reconoce otra vez |
| Android System WebView (emulador Android 35, 3 GB RAM) | flujo completo + reabrir la app y reconocer desde el paquete guardado |
| WKWebView del simulador de iPhone | igual que Android |

Nada de esto certifica un teléfono físico: el emulador y el simulador usan la CPU del servidor. Las pruebas físicas las hace el propietario.

## Resultados (CI Linux, Node; no es un teléfono)

Ejecución 42147xxxxx del workflow «Wivra Whisper WASM», 06-11-2026. % = palabras de la frase de referencia reconocidas.

| Muestra | Base Q5_1 (Preciso) | Tiny Q5_1 (Ligero) |
|---|---|---|
| Inglés, voz real (JFK) | 100 % | 100 % |
| Español, 2 voces naturales de macOS × 3 frases cotidianas | 93 · 100 · 92 · 93 · 100 · 85 (≈ 94 %) | 87 · 93 · 92 · 87 · 93 · 77 (≈ 88 %), a veces con basura («微 bra», «Polcam») |
| Español robótico (espeak-ng) que empieza a hablar en 0,0 s | 33–67 % | 67 % |
| El mismo con 0,5 s de silencio antes | 60 % | 67 % |
| Tiempo por trozo (whisper siempre procesa una ventana de 30 s) | ~32 s → ≈ ×1,1 del tiempo real en trozos completos | ~13 s → ≈ ×0,45 |

- **Cuantización:** Base Q8_0 y F16 dan lo mismo que Q5_1 en voz natural. Los errores de Base no vienen de la cuantización. Q8_0 fue ~30 % más rápido en WASM, pero el paquete es más grande; queda como posible mejora.
- **Fallback de temperatura:** misma precisión en voz natural. Sin fallback, Tiny entró una vez en un bucle («de la parte de la parte…»), así que queda **encendido**.
- **Primera palabra:** si la voz empieza en 0,0 s, se pierde. Wivra pone 0,5 s de silencio antes de cada trozo y corrige los tiempos.
- **Decisión:** **Preciso (Base) por defecto**; Ligero (Tiny) se sugiere en teléfonos que informan menos de 4 GB de RAM.
- **Android System WebView 124 (emulador Android 35):** flujo completo, y el paquete se conserva al reabrir la app. 43 s para 6,7 s de audio (una ventana de 30 s en la CPU emulada).
- **Chromium:** flujo completo, y la recarga sin red funciona.
- **iPhone (WKWebView del simulador):** pendiente de la ejecución con el motor nuevo.

## Si WebAssembly falla en teléfonos reales

Se conservan los contratos (`fromWhisperJson`/`validateTranscript`/`cuesToOps`) y se evalúa whisper.cpp nativo (mismo código C/C++, mismo formato JSON de salida) detrás del mismo botón. No se desarrolla un segundo motor independiente sin pruebas. Silero VAD queda como complemento opcional, no como requisito de la beta.

## Pruebas físicas que pedirá Claude (cortas)

1. Android: Texto → Subtítulos automáticos → Descargar «Preciso» con Wi‑Fi → Generar en un video de 30 s hablando en español. Anotar: tiempo, si acertó, si el teléfono se calentó o se cerró la app.
2. Lo mismo en modo avión (debe funcionar sin Internet).
3. iPhone: lo mismo; además comprobar que aparece el diálogo «¿Descargar?».
4. Cancelar a mitad: no debe agregar nada.
