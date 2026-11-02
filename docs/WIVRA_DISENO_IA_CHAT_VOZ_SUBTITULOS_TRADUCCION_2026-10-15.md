# Wivra · IA en forma de chat, dictado y subtítulos/transcripción/traducción

**Fecha:** 2026-10-15. **Carácter:** trabajo experimental no integrado a la rama de Claude, plan de ASR pendiente de implementación. **Prioridad:** experiencia simple para usuario, lógica avanzada bajo demanda.

## Auditoría de interfaz real del editor (Claude PR #44, HEAD base 9684ac0)

La pantalla anterior `#sAI` mezclaba `#aiLog`, dictado, contexto del Director, proveedor `#aiProv`, modelo `#aiModel`, dirección base, clave `#aiKey`, previsualización/aplicación y flujo copiar-pegar. El Director `#sDirector` duplica parte de conversación, briefing y plan de grabación. El usuario quiere chat cotidiano y voz primero, no credenciales.

**Esta PR aplica SOLO primera limpieza de pantalla:**
1. Encabezado «Asistente Wivra», historial de mensajes en burbujas, campo corto, botón Dictar donde el navegador exponga Web Speech, botón para revisar cambios, propuesta aplicar/descartar sin alterar validador.
2. Selector **Básico · gratis sin conexión** predeterminado: emplea `localBasicCommand` ya existente (solo dos patrones: texto citado y recorte numérico). **No es LLM** ni promete comprender ideas complejas.
3. **IA conectada · opcional**: reutiliza `askModel` existente, exige clave individual y autorización explícita al usar ese modo. Proveedor/modelo/clave viven dentro de «Configurar IA externa». No almacenar keys en proyecto ni backend de Wivra.
4. Fallback copiar/pegar permanece bajo acordeón avanzado para preservar funciones existentes.
5. No se cambia `core/operations.mjs`, import/export, persistencia, filtros, Director, cámara, LIVE ni fuente de medios. Los archivos `template.html` y `dist/agentcut.html` se mantienen sincronizados con `app/build.mjs` y se comprueban con CI.
6. Falta prueba visual/táctil en Safari iPhone/Android real. Si se desea una sola IA/conversación en toda Wivra, Claude debe revisar fusión lógica Director+Chat manteniendo briefings y operaciones.

## Subsistema subtítulos automático, en etapas

**A. Gratis sin API por defecto:** OpenAI publicó Whisper como modelo y pesos abiertos con licencia MIT (revisar versiones exactas y dependencias), y `ggml-org/whisper.cpp` ejecuta modelos Whisper localmente en iOS, Android, macOS, Windows y Linux. Incorporar solo a través de adaptador nativo o entorno desktop cuando se mida memoria, latencia, precisión en español, consumo batería/tamaño descarga; no afirmar que HTML Safari actual ejecuta un modelo.

**B. OpenAI API opcional con consentimiento y costes:** `POST /v1/audio/transcriptions` ofrece `whisper-1`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `gpt-4o-transcribe-diarize` (confirmar disponibilidad al integrar). La API es una facturación aparte de ChatGPT Plus. `whisper-1` admite salida `srt`/`vtt`/`verbose_json` y timecodes por palabra/segmento cuando se piden en formato compatible; algunos modelos 4o solo dan JSON y requieren alineación adicional. Con `POST /v1/audio/translations` la traducción de audio es **a inglés** con `whisper-1`: para español→francés o inglés→alemán, transcribir en origen y luego traducir el texto con un modelo específico; NO tratar esa API como traducción arbitraria de lenguas.

**C. Pipeline objetivo, SIN implementar aún:**
```
Video/proyecto autorizado → elegir pista de voz correcta (no duplicar L/R)
→ extraer audio local + análisis VAD → ASR local o nube con consentimiento
→ lenguaje detectado / marcas de tiempo → segmentación de subtítulos (SRT/VTT)
→ editor texto/timing/correcciones → opcional traducción por segmentos
→ pistas de subtítulos por idioma (ES/EN/FR/DE y ampliables)
→ previsualización igual a export (quemado opcional + sidecar SRT/VTT)
```
Los subtítulos no deben mezclarse con `texts` simples que carezcan de asociación estable por segmento/audio. Añadir esquema de `SubtitleTrack` enlazado a `assetId`, `start/end` y `lang` con confianza/provenance y reglas de persistencia/export. El usuario puede editar, ocultar, fusionar, cambiar estilo y corregir traducciones. Preservar idioma original, respetar jerga/nombres propios, no inventar transcripción sobre música/silencio. Video offline sigue editable aunque no se instale Whisper.

## Contratos/UI de aceptación

- Sin claves, escribir «Recorta clip 1 desde 2 a 7» → propuesta local real → aplicar o descartar; «crea automáticamente un Reel increíble» → error honesto de modo básico, nunca simulación de IA avanzada.
- Con clave, cambiar a «IA conectada», desplegar ajustes, pedir operación → respuesta validada por editor, no se aplican cambios sin revisión.
- Dictado: el botón aparece solo si Web Speech API existe; si no, instrucción del micrófono del teclado. El dictado del navegador NO garantiza procesamiento privado/offline.
- Archivo 2 voces y 2 canales: no fabricar subtítulos dobles cuando `channelIndex` no se haya separado físicamente; registrar bloqueo del importador.
- Subs con idioma de origen ES y traducción EN/FR: texto debe acompañar timecodes, idioma y pistas separadas; export SRT/VTT + incrustación visual verificable; modelos opt-in si facturan o suben audio.

## Coordinación Claude / ChatGPT

Claude es dueño del editor y revisará UI, accesibilidad, coherencia con `#sDirector`, snapshots y tests en rama aislada. ChatGPT puede liderar STT local, integración de audio con micrófonos y adaptar Whisper a iOS/Android una vez acordado contrato `SubtitleTrack`. **No fusionar a `main` sin autorización del propietario.**

Fuentes de investigación: https://github.com/openai/whisper ; https://github.com/ggml-org/whisper.cpp ; https://platform.openai.com/docs/api-reference/audio/createTranscription ; https://platform.openai.com/docs/api-reference/audio/createTranslation .
