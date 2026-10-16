# Wivra · Matriz de estado del EDITOR (beta) · 16-oct-2026

Escrita por Claude (editor). Estados por **evidencia**, no por intención. Vocabulario: **EN RAMA** (código en la rama beta, pruebas automáticas) · **CI** (verde en GitHub) · **VERIFICADO EN HARDWARE** (iPhone/Android reales) · **PENDIENTE**.
Nada del editor está verificado en hardware real todavía: Chromium simulado **no** es un iPhone ni un Android WebView.

Rama de integración: `claude/beta-editor-integration` (PR #124, base `chatgpt/wivra-beta-complete-assembly-20261016`). Pruebas locales al escribir esto: app 217 · core 90 · streaming 158 · skill-pack 12, todas OK; CI de #124: 11 comprobaciones OK (incluye APK Android y IPA iPhone sin firmar).

| Función del editor | En rama (PR) | Hardware real | Pendiente / nota |
| --- | --- | --- | --- |
| Importar video, audio, fotos y GIF (con límites y motivos claros) | EN RAMA (#83, #96) | PENDIENTE | Videos muy largos y HEVC del teléfono sin probar |
| Línea de tiempo multipista: capas, audio, fotos como clips principales, deshacer | EN RAMA | PENDIENTE | Rendimiento con muchos clips mejorado (#91), sin medir en teléfono |
| Proyectos guardados y recuperación; la idea del Director viaja con el proyecto | EN RAMA (#89) | PENDIENTE | Almacenamiento real del teléfono sin probar |
| Filtros, looks, intensidad, grano; exportados a la resolución de salida | EN RAMA (#93) | PENDIENTE | |
| Texto con lugar, tamaño, color y caja | EN RAMA (#112) | PENDIENTE | |
| Subtítulos: importar/guardar .srt y .vtt, editar y borrar | EN RAMA (#86) | PENDIENTE | **No hay transcripción automática** (ver abajo) |
| Zona segura para textos (9:16) | EN RAMA (#123) | PENDIENTE | Medidas de Wivra, no una regla oficial de Reels/TikTok |
| Montaje rápido a 15/30/45/60 s, con **AutoCut v1** opcional (elige el tramo donde más se oye) | EN RAMA (#99 + AutoCut en #124) | PENDIENTE | AutoCut usa solo el volumen: no entiende palabras ni imágenes; sin diferencias de volumen deja el centro |
| Plantillas (reel, historia, cuadrado, horizontal, recuerdo, «Pantalla + cara») | EN RAMA (#100, #123) | PENDIENTE | Recetas propias; sin slots de foto/video ni animaciones |
| Quitar silencios (por volumen, en el teléfono) | EN RAMA (#114) | PENDIENTE | No entiende palabras; no sirve con música o ruido continuo |
| Volumen parejo al exportar (opcional, −14 / −16 LUFS) | EN RAMA (#119) | PENDIENTE | Medido en Chromium: −15,3 → −14,1 LUFS. Probar en iPhone/Android: el códec puede variar décimas |
| Exportación 9:16 con audio, cancelable y avisos | EN RAMA (#94) | PENDIENTE | Va en tiempo real: 20 s de video tardan ~20 s |
| Revisión de ritmo del Director | EN RAMA (#123) | PENDIENTE | Solo cuenta tiempos; no ve ni oye el video |
| Director: idea, guion y lista de tomas guardados | EN RAMA (#89) | PENDIENTE | |
| Director: plan de producción con lugares y guion tuyos (reel, minidoc, serie, película vertical), reordenar tomas, estados Hecha/Por repetir/Saltada (saltar pide confirmación) | EN RAMA (contrato #73 + interfaz en #124) | PENDIENTE | No inventa rutas ni datos del lugar; el orden es el que pones |
| Órdenes cortas a la lista de tomas (escritas o dictadas con el micrófono del teclado): «ya la hice», «siguiente», «repite», «repetir toma», «saltar» | EN RAMA | PENDIENTE | Frases fijas en 8 idiomas; **no es reconocimiento de voz propio** ni manos libres con AirPods/Siri (pendiente, depende del sistema) |
| Teleprompter de prueba dentro del editor (guion de la toma, velocidad y tamaño; no se graba) | EN RAMA | PENDIENTE | **No se muestra todavía sobre la cámara**: eso es captura nativa (ChatGPT); el guion está en `shot.script` del plan |
| **Velocidad** de un clip (0.25× a 4×: cámara lenta y rápida) en video, capa o audio, o de **todos los videos** a la vez («Todos los videos» en la hoja Velocidad); lo que sigue se corre y el audio del video cambia igual | EN RAMA (#124) | PENDIENTE | Probado solo en Chromium simulado (vista previa a 2×, exportación de 5 s reales). **iPhone/Android sin verificar**: fuera de 0.5×–2× el sonido puede salir raro o mudo. «Quitar pausas», «Montaje rápido» y «Pantalla + cara» se niegan con clips en velocidad y lo dicen |
| **Transición en los cortes** (fundido / deslizar / zoom en todos los cortes de la línea principal; se deshace de una vez) | EN RAMA (#124) | PENDIENTE | Usa los efectos de entrada/salida que ya existían (probados en vista previa y exportación en Chromium simulado). Es salir y entrar, no mezcla cruzada |
| **Subtítulos automáticos** en el teléfono (Whisper MIT en WebAssembly, en un Worker; modelo de 31 o 57 MB que se baja UNA vez con permiso) | EN RAMA (#124) | PENDIENTE | **Calidad y velocidad reales NO medidas**: desde el entorno de desarrollo no se pueden bajar los modelos. Probado: flujo completo con motor simulado y arranque del motor real con un modelo vacío de prueba (Chromium simulado). La app muestra «Tardó X s para Y s de audio» para medir en tu teléfono. WKWebView/Android WebView: **sin verificar** (Worker + import dinámico desde Blob, memoria) |
| **Collage** (plantilla: los primeros 2–4 clips a la vez en cuadros; 2–3 en vertical 9:16, 4 en cuadrícula 1:1; duran lo del video más corto; suena solo el 1.º) | EN RAMA (#124) | PENDIENTE | Probado: 261 pruebas de la app + E2E en Chromium simulado (se ven los cuadros, deshacer exacto, inglés). Sin prueba en iPhone real. No se combina con clips en cámara lenta en el 1.er paso (la velocidad se copia a su cuadro). Es una sola acción reversible |
| **Plantillas con huecos** (Ráfaga 6×1,5 s, Antes y después 2×4 s, Top 3 con cuenta regresiva): cada hueco se llena con el clip que le toca, del centro; fotos duran lo del hueco; rótulos en el idioma elegido | EN RAMA (#124) | PENDIENTE | Probado: 7 pruebas unitarias + E2E en Chromium simulado (resumen, aplicar, deshacer exacto, inglés). Los huecos los llena el ORDEN de los clips (no hay un selector de «arrastra tu foto aquí»). Sin prueba en iPhone real |
| **Música de Wivra** (6 pistas originales de ~30 s generadas por código en el teléfono: Pulso, Calma, Viaje, Energía, Suspenso, Lo-fi; sin internet, sin cuentas, sin música de terceros) | EN RAMA (#124) | PENDIENTE | Probado: pruebas unitarias (determinista, sin silencio/NaN, WAV válido) + E2E en Chromium simulado (suena, se agrega como pista, deshacer, inglés). **Gusto musical NO evaluado con oyentes**; son pistas simples de fondo. Tiempo de generación en iPhone: sin medir (en Node tarda ~0,2–0,4 s por pista). Licencia: obra original; queda bajo la licencia que apruebe el propietario (propuesta MIT, PR #36) |
| **Exportar: la música que pasa del final del video se corta con un fundido de 0,8 s** (antes alargaba el video con negro) | EN RAMA (#124) | PENDIENTE | Hallado con la prueba de flujo completo (música de 29 s sobre video de 9 s exportaba 29 s). Las capas de video sí siguen alargando el video (con negro si hace falta). Probado: unitarias + flujo completo en Chromium simulado (importar → 9:16 → texto → subtítulos → música → velocidad → transiciones → deshacer/rehacer → exportar: 1080×1920, 9 s, con audio). iPhone real: sin probar |
| Chat con IA: comandos locales básicos + IA por clave propia (opcional) | EN RAMA | PENDIENTE | Ver «IA y gratuidad» |
| Accesibilidad básica (nombres de botones y campos) | EN RAMA (#119) | PENDIENTE | Sin prueba con VoiceOver/TalkBack |
| 8 idiomas (es, en, pt, fr, de, ja, zh, it) | EN RAMA | — | Traducciones automáticas, **sin revisión de hablantes nativos** |

## Lo que el inventario #121 pide y el editor aún NO tiene (no es «hecho»)
- **Transcripción / subtítulos automáticos locales y gratuitos** (issue #6): 🟡 implementado el flujo (ver tabla); falta **medir en el teléfono** qué modelo (rápido/mejor) rinde bien en tiempo, memoria y calidad en español. Sigue pudiéndose importar/editar .srt/.vtt.
- **AutoCut editable a partir de clips reales** (C04): 🟡 v1 hecho (montaje a duración exacta eligiendo el tramo con más voz, en un solo paso reversible). Falta: elegir por contenido (imagen/palabras, necesita análisis o transcripción local) y duración exacta de un audio.
- **Teleprompter sobre la cámara** (D06): 🟡 la pantalla de lectura existe en el editor; falta mostrarla encima de la cámara de Wivra (nativo, ChatGPT) sin que salga en el archivo. **Manos libres** (Siri/AirPods, D08/E04): ❌ pendiente/condicionado al sistema.
- **Transiciones entre clips**: 🟡 «Transición en todos los cortes» (Efectos): salida del clip que termina + entrada del siguiente (fundido, deslizar, zoom), con duración elegida. **No es disolvencia cruzada real** (mezclar los dos clips a la vez necesita solapar clips en la línea principal): ❌ no implementada; `set_transition` queda sin hacer. **Velocidad** (cámara lenta/rápida): 🟡 hecha para un clip a la vez (ver tabla); falta probarla en iPhone y Android, y no hay «todos los clips» ni rampas de velocidad.
- **Máscaras** (en clips de la línea principal): ❌. (Collage y plantillas con huecos: hechos, ver tabla; falta un selector visual de «arrastra tu foto al hueco».)
- **Música**: se puede importar la del usuario y mezclarla, y hay 6 pistas originales de Wivra incluidas (ver tabla). Biblioteca más grande o con música de terceros: pendiente de licencias.

## IA y gratuidad (política del propietario: 100 % gratis para el usuario)
- El editor funciona **sin cuenta, sin servidor y sin pagar**: edición, filtros, texto, silencios, volumen, ritmo, plantillas y exportación son locales.
- El chat entiende comandos básicos **en local**. Conectar una IA externa (Claude, OpenAI, Gemini…) con **clave propia** es **opcional** y la paga cada persona al proveedor; **no es un requisito ni una función de Wivra**, y no debe presentarse como gratuita.
- Costos que **no** son cero aunque el usuario no pague: alojamiento/distribución, cuenta de desarrollador de Apple para firmar iPhone, Play Store. Se informan aparte al propietario.

## Pruebas físicas que solo el propietario puede hacer (lista corta)
1. Importar 2–3 videos del teléfono (uno largo, uno HEVC) y una foto → armar → exportar 9:16 → ver el resultado en Fotos.
2. Exportar con «Volumen: Parejo» y con «Como está» y comparar a oído.
3. Plantilla «Pantalla + cara» con una grabación de pantalla y un video de tu cara.
4. «Quitar silencios» en un video donde hablas con pausas.
5. Cambiar el idioma y mirar que nada se corte.
Anotar el resultado en el issue #49.

— Claude
