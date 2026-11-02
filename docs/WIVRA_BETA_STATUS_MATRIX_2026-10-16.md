# Wivra · Matriz de estado del EDITOR (beta) · 16-oct-2026
## Revisión de integración a 01-11-2026

Este bloque actualiza la foto histórica del editor Claude del 16 de octubre que sigue debajo. Se verificó el checkpoint MU, repositorio Wivra, PR de Claude y Codex, y los CI. Ninguna función está certificada en hardware físico por estas pruebas.

| Área | Confirmado en rama y pruebas | Pendiente real |
| --- | --- | --- |
| Editor y Director | #136 integra recuperación de captura, 7 módulos reconstruidos, edición/Director y exportación progresiva Claude #132; #160 272 commits adelante de #136, cero atrás | Uso y velocidad con clips reales, accesibilidad |
| Exportación | MediaRecorder progresivo, WebM/MP4 con reparación y CRC; 10/20/30/60 min Chromium/Linux CI SUCCESS [41151818001](https://github.com/Os-WHGo/Wivra/actions/runs/41151818001) | MP4, audio, seek y 30/60 min físicos con teléfono, temperatura |
| Motor rápido | WebCodecs+Mediabunny 8,5x en benchmark 60 s Linux, NO integrado: ACCELERATED_EXPORT_IMPLEMENTED=false en app/export-engine-policy.mjs | Render multipista, writer random-access, fallback y prueba física |
| Ray-Ban Meta | DAT Gen2, HEVC por segmentos, diario de captura y unión para una sola película tras validación, permisos | Sesiones largas reales y pantalla bloqueada, límite gafas, LIVE Ray-Ban |
| Android FULL LIVE | RootEncoder RTMP, cámara frontal/trasera, MP4 local opt-in, audio preferido USB/BT, MediaProjection pantalla/app consentido; #155 3/3 CI success | Plataforma RTMP/VOD, micrófonos y grabaciones reales |
| iPhone LIVE | #156 valida RTMP(S) y completó 3/3 CI; #157 implementa HaishinKit 2.2.5 y MP4 privado; #160 reconcilia frontal/trasera con MP4/recovery y gate espacio 256 MiB | CI exacto #160 pendiente, emisión y MP4 físicos, firma iOS |
| Artefactos | Android DEBUG APK y iPhone arm64 UNSIGNED IPA pasaron en #155/#156, más emulador Android | Instalar Android autorizado, firma iOS del propietario, QA por lotes |

Claude y Codex no están activos. PR #158/#159 son ramas históricas paralelas: no fusionar sus HEAD antiguas encima de #160 ni borrar la nueva copia MP4. Seguir siempre el último SHA de [PR #160](https://github.com/Os-WHGo/Wivra/pull/160), el checkpoint privado Wivra y la biblioteca MU. No tocar main, publicar, gastar ni declarar hardware probado. Meta beta 19-11-2026.

---


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
| **Exportación larga por partes** (cada segundo se escribe en el teléfono y se verifica con CRC; memoria acotada; el modo en memoria anterior sigue disponible) | EN RAMA (#132, 30-10-2026) | PENDIENTE | Chromium + puente simulado: 12/12. Android: galería `Movies/Wivra`; iPhone: hoja Compartir. Sin probar en teléfono físico, con pantalla bloqueada ni con gafas. Informe: `docs/WIVRA_PROGRESSIVE_EXPORT_2026-10-30.md` |
| **Duración y saltos del video exportado** (WebM y MP4 reparados sin recodificar; Android exporta otra vez: el WebView bloqueaba `play()`) | EN RAMA (#132, 31-10-2026) | PENDIENTE | Emulador: 0 ms → 2.237 ms y exportación real OK; macOS AVFoundation OK; iPhone y Android físicos sin probar |
| Revisión de ritmo del Director | EN RAMA (#123) | PENDIENTE | Solo cuenta tiempos; no ve ni oye el video |
| Director: idea, guion y lista de tomas guardados | EN RAMA (#89) | PENDIENTE | |
| Director: plan de producción con lugares y guion tuyos (reel, minidoc, serie, película vertical), reordenar tomas, estados Hecha/Por repetir/Saltada (saltar pide confirmación) | EN RAMA (contrato #73 + interfaz en #124) | PENDIENTE | No inventa rutas ni datos del lugar; el orden es el que pones |
| Órdenes cortas a la lista de tomas (escritas o dictadas con el micrófono del teclado): «ya la hice», «siguiente», «repite», «repetir toma», «saltar» | EN RAMA | PENDIENTE | Frases fijas en 8 idiomas; **no es reconocimiento de voz propio** ni manos libres con AirPods/Siri (pendiente, depende del sistema) |
| Teleprompter de prueba dentro del editor (guion de la toma, velocidad y tamaño; no se graba) | EN RAMA | PENDIENTE | **No se muestra todavía sobre la cámara**: eso es captura nativa (ChatGPT); el guion está en `shot.script` del plan |
| **Velocidad** de un clip (0.25× a 4×: cámara lenta y rápida) en video, capa o audio; lo que sigue se corre y el audio del video cambia igual | EN RAMA (#124) | PENDIENTE | Probado solo en Chromium simulado (vista previa a 2×, exportación de 5 s reales). **iPhone/Android sin verificar**: fuera de 0.5×–2× el sonido puede salir raro o mudo. «Quitar pausas», «Montaje rápido» y «Pantalla + cara» se niegan con clips en velocidad y lo dicen |
| **Transición en los cortes** (fundido / deslizar / zoom en todos los cortes de la línea principal; se deshace de una vez) | EN RAMA (#124) | PENDIENTE | Usa los efectos de entrada/salida que ya existían (probados en vista previa y exportación en Chromium simulado). Es salir y entrar, no mezcla cruzada |
| Chat con IA: comandos locales básicos + IA por clave propia (opcional) | EN RAMA | PENDIENTE | Ver «IA y gratuidad» |
| Accesibilidad básica (nombres de botones y campos) | EN RAMA (#119) | PENDIENTE | Sin prueba con VoiceOver/TalkBack |
| 8 idiomas (es, en, pt, fr, de, ja, zh, it) | EN RAMA | — | Traducciones automáticas, **sin revisión de hablantes nativos** |

## Lo que el inventario #121 pide y el editor aún NO tiene (no es «hecho»)
- **Transcripción / subtítulos automáticos locales y gratuitos** (issue #6): ❌ no implementado. Falta elegir y medir un modelo abierto en teléfono (licencia, tamaño, velocidad). Mientras tanto solo hay importar/editar .srt/.vtt.
- **AutoCut editable a partir de clips reales** (C04): 🟡 v1 hecho (montaje a duración exacta eligiendo el tramo con más voz, en un solo paso reversible). Falta: elegir por contenido (imagen/palabras, necesita análisis o transcripción local), collage y duración exacta de un audio.
- **Teleprompter sobre la cámara** (D06): 🟡 la pantalla de lectura existe en el editor; falta mostrarla encima de la cámara de Wivra (nativo, ChatGPT) sin que salga en el archivo. **Manos libres** (Siri/AirPods, D08/E04): ❌ pendiente/condicionado al sistema.
- **Transiciones entre clips**: 🟡 «Transición en todos los cortes» (Efectos): salida del clip que termina + entrada del siguiente (fundido, deslizar, zoom), con duración elegida. **No es disolvencia cruzada real** (mezclar los dos clips a la vez necesita solapar clips en la línea principal): ❌ no implementada; `set_transition` queda sin hacer. **Velocidad** (cámara lenta/rápida): 🟡 hecha para un clip a la vez (ver tabla); falta probarla en iPhone y Android, y no hay «todos los clips» ni rampas de velocidad.
- **Collage**, **plantillas con slots foto/video**, **máscaras**: ❌.
- **Música**: se puede importar la del usuario y mezclarla; **no hay biblioteca de música** incluida (licencias pendientes).

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
