# Wivra · pruebas físicas de la beta (lo nuevo de W86 a W102)

Para el propietario, a partir del 16-11-2026. Cada prueba dura de 5 a 20 minutos. Anota en el issue o en el chat qué teléfono usaste, si pasó (**sí / no**) y qué viste.
Nada de esto está probado en un teléfono real: solo en el CI (Chromium, emulador Android y simulador de iPhone). — Claude

## Antes de empezar
- Teléfono con al menos 2 GB libres y batería por encima del 50 %.
- Wi-Fi solo para descargar el paquete de voz una vez. Después se puede probar en modo avión.

## 1. Subtítulos automáticos (W86, W98, W101, W102)
1. Editor → Texto → Subtítulos automáticos → **Descargar paquete de voz** («Preciso»). Luego activa el modo avión.
2. Un video corto (1–3 min) donde hables: **Generar subtítulos**. Comprueba que el texto aparece a tiempo.
3. Un video **largo** (30–60 min) con partes en silencio: **Generar subtítulos**. Anota cuánto tarda, si el teléfono se calienta y si llega al final.
4. Cierra Wivra por completo, vuelve a abrir el mismo proyecto y pulsa **Generar subtítulos**. Debe aparecer «Elegir otra vez «nombre»». Elige el mismo video y vuelve a pulsar Generar.
5. Dictado: en el chat, toca 🎤 y di una frase. Debe aparecer escrita.

**Pasa si** los subtítulos salen en su momento, nada se envía a internet y no se cierra la app.

## 2. Voz en off (W92)
1. Editor → Agregar → **🎙️ Grabar voz en off** mientras se ve el video. Detén.
2. Debe aparecer una pista de audio nueva que suene alineada con el video.

## 3. Grabar pantalla en Android (W99)
1. Fuentes → Cámara → **Grabar pantalla (sin transmitir)** → marca «Incluir mi micrófono» → Elegir pantalla y grabar → acepta el permiso de Android.
2. Abre otra app y habla 1–2 minutos. Detén desde la notificación.
3. Vuelve a Wivra → **Guardar**. En el editor: Importar → video del teléfono → revisa imagen, sonido y duración.
4. Repite y corta la captura desde el aviso del sistema. El video debe quedar en «Grabaciones sin guardar».

## 4. Grabar pantalla en iPhone (W100)
1. Inicio → **Grabar pantalla** → botón redondo → elige «Wivra» → enciende el micrófono → Iniciar.
2. Abre otra app con sonido (por ejemplo, música) y habla 1–2 minutos.
3. Detén con el indicador rojo (arriba) → vuelve a Wivra → **Pasar a Wivra**.
4. En el editor: Importar → Grabaciones de Wivra. Deben verse el video y **dos pistas**, el sonido de la app y tu micrófono, alineadas.
5. Repite girando el iPhone a horizontal y anota cómo queda el video.

**Si al instalar en iPhone aparece un error de firma** que menciona «App Group» o la extensión, anótalo tal cual. Se puede quitar esta función sin tocar el resto.

## 5. LIVE (W93, W94, W95)
1. LIVE → pon tu dirección de prueba → antes de confirmar debe verse la **red** que usas y cuánto **ocupa por minuto**.
2. Prueba los tres valores de **Copia local** (Guardar siempre / Preguntar / No guardar). Cierra y abre Wivra: debe recordarse la elección, pero nunca la clave.

## 6. Teleprompter (W96) e importación (W97)
1. Director con un guion → **🎥 Grabar con teleprompter**. El texto debe verse sobre la cámara.
2. Importa dos veces el **mismo** video. Wivra debe avisar que «ya estaban en el proyecto: se reutilizaron sin guardarlos dos veces» (no ocupa el doble de espacio).

## Cómo informar
Para cada número escribe: «1-3: sí, 42 min, se calentó un poco». Si algo falla, una captura de pantalla ayuda mucho.
