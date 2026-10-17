# AutoCut multisegmento | Cierre técnico y matriz de QA
Fecha: 2026-10-17. Rama propietaria: `chatgpt/wivra-unified-owner-20261016`, PR #131 abierto, sin merge.

## Función implementada
- Con `Montaje rápido` + opción voluntaria `qaVoice`, un solo video suficientemente largo se divide en 3 a 8 momentos cronológicos repartidos. Duración objetivo 3..600 s, con ventanas mínimas de 3 s y duración suficiente para reparto; ante proyecto no elegible se conserva el planificador anterior.
- Ejemplo reproducible: video de 2700 s => seis ventanas de 10 s para 60 s, un solo lote atómico.
- Selección determinista dentro de cada región por voz/cues SRT/VTT con tiempos, luego volumen si hay contraste, y por defecto centro de esa región. Son pistas de tiempo, NO interpretación de imágenes ni estimación de «mejor paisaje».
- La operación se construye a través de `app/silence.mjs` (split/trim/delete/move; sincroniza audio asociado y retima textos), pasa por `core/operations.mjs` y se valida con `applyBatch` ANTES de habilitar Apply. No se modifica el motor de edición de Claude.
- Seguros: rechaza multiclip, overlays, velocidades distintas de 1x, música suelta y micrófonos que no cubren >=80% del video; retorna al montaje previo. Borrador reversible (undo). ASR real todavía no incluido.
- La lectura de PCM puede fallar con archivos grandes o códecs no soportados por WebView: en tal caso se usan fragmentos repartidos; no se declaran analizados. Si importación de SRT no correspondía al audio no se certifica su exactitud.
- Concurrencia: comparación de sesión/revisión tras `siAnalyze` para evitar una propuesta construida sobre un proyecto que cambió mientras se analizaba el audio.
- UI y traducciones corregidas en ES/EN/PT/FR/DE/JA/ZH/IT.

## Pruebas verificadas
- `app/tests/autocut-highlights.test.mjs` comprueba 45min->60s, distribución sin saltos de tiempo, heurística por señal y texto, sesión sin mutación previa, texto recalculado, micrófono WAV independiente, doble micrófono con offset +1s, fallback de casos ambiguos y guardia de revisión.
- [GitHub Actions App Tests #39072075346](https://github.com/Os-WHGo/Wivra/actions/runs/39072075346): **315 tests, 315 pass, 0 fail**.
- [GitHub Actions Audit/Rebuild #39072075334](https://github.com/Os-WHGo/Wivra/actions/runs/39072075334): **Core 90/90, App 315/315, dist sincronizado**.
- Los otros workflows del commit fuente anterior pueden marcar **failure** porque se ejecutaron antes del commit automático de HTML por Actions. Eso es bloqueo por sincronización, NO evidencia de falla de código nativo. Verificar la suite móvil de un commit posterior con `dist` ya al día antes de afirmar build.
- Pendientes explícitos: iOS/Android físicos, AVC/HEVC/HDR, 45-min de archivo real, audio WAV desfases negativos soportados por captura, batería/memoria, captions complejos, interrupción y persistencia, pruebas LIVE/Ray-Ban reales.

## Integraciones externas e investigación
- Ningún modelo Whisper, sherpa-onnx, Silero, CLIP, backend o paquete adicional instalado con este bloque.
- Repositorios candidatos y cautelas en `docs/WIVRA_GITHUB_LIBRARIES_RESEARCH_2026-10-17.md`.
- Catálogo transversal en Google Drive, mismo documento canónico (sin reorganización de Drive):
  https://docs.google.com/document/d/176f1Di1Dz9AEZRp1PksM8_WJ5IEbQkWYOutEc4rVsYc/edit
- Proyecto Cero controla la reorganización; Wivra solo registra hallazgos y modifica código del producto.

## Próximo bloqueo
- Verificar de extremo a extremo importación SRT, AutoCut multisegmento, audio independiente, undo, exportación y carga del proyecto en WebView Android e iOS físicos.
- Si la compilación nativa se valida, trabajar fallos concretos y entonces preparar instalación/beta; no confundir CI verde con prueba de dispositivos físicos.
