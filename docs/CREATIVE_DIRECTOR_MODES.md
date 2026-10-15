# Creative Director · briefs contextuales sobre múltiples videos
**13 octubre 2026 · — ChatGPT**

**Alcance exacto:** esta rama deriva de `claude/media-library` (PR #38). Complementa el editor de Claude sin reemplazarlo y **no fusiona main**. El nombre público del producto sigue en discusión; no se cambian identificadores técnicos.

## Intención confirmada por el propietario

Una persona puede empezar con una petición brevísima o con una explicación larga por voz; puede pedir un montaje de videos existentes, o describir un video **antes de grabar**. Después puede corregir lo dicho y la IA debe recordar el contexto del proyecto sin repetir todo desde cero.

Tres experiencias que comparten contrato:

### A. Automática, cero explicaciones

> «Hazme un Reel de 30 segundos con los mejores momentos de estos videos.»

La IA debe analizar **evidencia real** (video/audio), encontrar momentos destacados y preparar un plan verificable. Si solo se dispone del nombre del archivo y seis fotogramas con variación numérica, **no fingir** que se conocen los mejores momentos ni emitir timecodes inventados.

### B. Guiada por explicación de cada video

> «Tengo cinco videos: en el primero caminé por Granville; en el segundo pasé por Burrard; en el tercero grabé el Convention Centre; en el cuarto los hidroaviones; en el quinto el regreso. Haz un capítulo divertido para YouTube y tres versiones verticales, con subtítulos y voz en off, sin repeticiones».

Las notas habladas sirven de **índice semántico aportado por el usuario** para reducir trabajo de visión. El agente debe cotejar esas pistas con fotogramas/transcripción/metadatos antes de afirmar un lugar y timestamp preciso. Diferenciar `user_reported` de `observed_by_model`, `verified_gps` y de hipótesis.

### C. Dirección previa a una grabación (preproducción)

> «Quiero grabar un TikTok de 45 segundos de una cafetería; cinco cortes, tomas POV, transición suave, un gancho y música. Guíame».

Sin archivo de video, el agente propone **guion, lista de planos, duraciones aproximadas, consejos de encuadre, efectos, voz y esquema de montaje**. No dice que grabó/editará ya una fuente inexistente. Posteriormente se enlazan las tomas grabadas al plan y se completa la edición en el mismo proyecto.

**En todos los modos:** si el usuario ordena «cambia la tercera escena, usa otra toma, baja la música, añade una frase más», conservar la secuencia conversacional y corregir el plan actual, no reconstruir desde cero. Preguntar solo si faltan datos indispensables. Mantener copia de originales, historial, acceso privado local/cloud autorizado, estimación transparente de IA/almacenamiento/costos.

## Implementación real de este PR

- `core/creative-director.mjs`: contrato puro para `automatic`, `guided`, `preproduction`; briefing con `goal`, `platforms`, duración opcional, cantidad de versiones, preferencias, ideas de tomas, historial de instrucciones/correcciones, y explicaciones por `assetId`. `userDescription` se marca **user_reported**. Genera contexto/prompt para otro modelo **sin subir fotos, GPS ni transcripciones no verificadas**. No hace inferencia ML.
- `core/tests/creative-director.test.mjs`: pruebas de tres modos, cinco videos, instrucciones largas, sin video para preproducción, privacidad y límites de inputs.
- `app/template.html` + `app/dist/agentcut.html`: herramienta «Director», selección de modo, objetivo, duración, formatos, número de versiones, estilo, nota por video, correcciones adicionales y botón «Preparar y copiar briefing». **Puede abrirse sin medios en preproducción**, a diferencia de IA del editor. Dictado disponible **mediante el teclado del sistema**, no hay todavía grabador ASR propio. Campo fallback si navegador no autoriza portapapeles.
- `app/build.mjs`: el contrato se incluye en el único archivo HTML de la prueba móvil. Tests CI de core, sintaxis, rebuild idéntico y presencia de controles.

**Lo que NO hace:** analizar semánticamente videos, transcribir voz directamente en Wivra, generar clips, renderizar/exportar el audio, producir voz artificial, crear efectos o guion mediante un modelo integrado. **Eso sigue pendiente**. Las respuestas generadas en ChatGPT/Claude externos deben traducirse a herramientas permitidas de `core/operations.mjs` y pasar validación + revisión; copiar un briefing por sí solo **no edita**.

## Próxima integración recomendada para Claude

1. Evaluar el PR sobre #38, conservar **un solo editor**, evitar duplicar manejo de assets.
2. Permitir que la nota narrada de cada video se almacene **persistente con el proyecto** bajo `assetId` y que permita importación/exportación. En el prototipo actual vive solo en memoria de la página; se pierde si recargas.
3. Conectar ASR nativo iOS/Android o whisper.cpp **solo cuando haya modelo medido en teléfono**, capturar correcciones por voz y ofrecer revisión de transcripción. No confundir audio del video con instrucciones orales.
4. Agregar capa de evidencias verificadas: indexado incremental → frame sampling → detección de voz/VAD → transcripción selectiva → OCR letreros → metadata GPS cuando exista → VLM solo segmentos necesarios. Reutilizar `app/vision.mjs` y no procesar todos los fotogramas de 200GB.
5. Un modelo de lenguaje **real** convierte briefing + evidencias a guion, plan de edición, texto, restricciones y herramientas del editor. Crear una vista previa y aplicar cambios en lote con un solo deshacer.
6. Capacidades que el propietario pide, pero que requieren motor de medios: subtítulos automáticos sincronizados, narración por IA/TTS, música con derechos, fondos o B-roll autorizado, transiciones, reencuadre y **exportación de archivo verdadero**. No etiquetar botones «pronto» como completados.
7. Las plataformas YouTube/Reels/TikTok/Shorts usan **múltiples entregables del mismo proyecto** con proporciones y duraciones distintas; evitar generar versiones idénticas solo cambiando la etiqueta.

**Pruebas de aceptación:**
- Sin archivos: «Quiero grabar TikTok 45 s y cinco cortes» → briefing de preproducción sin fingir video.
- Cinco MOV/MP4: asociar notas específicas a cada `assetId`, crear guion orientado a YouTube + tres Reels, conservar orden de narración, pero etiquetar observaciones no verificadas.
- «Haz los mejores momentos» sin narración → petición automática que debe **investigar contenidos**, no inventar.
- Dictar párrafos largos con teclado de iOS; comprobar que no desaparecen al alternar campos, y separar audio de comentario del audio original.
- Copiar y pegar briefing sin filtrar fotogramas privados ni URLs de archivos. Confirmar que ningún original sale del teléfono desde esta pantalla.
- Próximamente: exportación verdadera, ASR, VLM y persistencia para completar el circuito.

**Coordinación de ramas:** [PR #38](https://github.com/Os-WHGo/agentcut/pull/38) de Claude ya soporta múltiples videos. Este PR está construido encima de esa rama y se deja **en borrador**, no se fusiona `main`. ChatGPT sigue el streaming Ray-Ban Meta en [PR #35](https://github.com/Os-WHGo/agentcut/pull/35).

— ChatGPT
