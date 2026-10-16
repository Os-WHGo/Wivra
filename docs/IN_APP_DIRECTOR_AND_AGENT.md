# Wivra · grabación guiada dentro de la app + agente editor integrado

**13 oct 2026 | — ChatGPT**  
**Base:** PR #39 `chatgpt/creative-director-brief-20261013`, que depende del editor multi-clip de Claude PR #38. **No fusionar main.**

## Problema resuelto en esta capa

El propietario NO quiere seguir copiando prompts a ChatGPT/Claude cuando Wivra esté integrada. Quiere decir:

> «Quiero grabar un Reel de 45 segundos sobre este lugar; recomiéndame los planos, lugares para filmar y organiza una lista que vaya marcando. Cuando termine, busca los clips, organiza un guion, subtitula, agrega voz de IA y edita desde la misma aplicación».

**Separación obligatoria:** idear tomas ≠ ver videos ≠ editar ≠ exportar. Una interfaz integrada debe orquestar estas operaciones con herramientas locales verificadas y un modelo real cuando esté conectado; no afirmar que un modelo semántico ya está disponible.

### Estado REAL de este PR

- `core/shoot-checklist.mjs`: genera **plantilla local** de 3 a 12 tomas con duración aproximada, instrucciones POV, progreso, vinculación de cada toma a un `assetId` realmente cargado. Sugerencias de ángulos **genéricas**, no direcciones comerciales inventadas. Recibe también propuestas de tomas de futuros modelos mediante `validateProviderShotPlan()`. Los lugares generados por modelos quedan como **no verificados**.
- `core/in-app-agent.mjs`: puente `createAgentToolController({session,model})`. El modelo (inyectable) recibe resumen estructurado del proyecto y responde operaciones permitidas; `applyBatch()` valida primero sin alterar el proyecto, exige aprobación explícita y luego llama a `Session.apply()`, permitiendo **deshacer**. Rechaza comandos desconocidos, tiempos inválidos y revisiones obsoletas. **No conecta aún Apple Foundation Models, Claude API ni OpenAI API.**
- `localBasicCommand()`: intérprete determinista **extremadamente limitado** sin IA, solo dos comandos («Pon texto “...”» y «Recorta clip 1 desde 2 a 8»). Demuestra que el modelo puede controlar el editor **desde su pantalla**, sin copiar y pegar ni abrir otra app. Mostrar límites explícitamente.
- `app/template.html` y único archivo `app/dist/agentcut.html`: hoja «Director» incluye lista de grabación con casillas que se marcan con un toque, sugerencias genéricas de punto de vista, botón para invocar selector/cámara del teléfono (`<input type=file capture=environment>`; la disponibilidad real depende del navegador), asociación al activo importado, progreso y guardado en `localStorage` del navegador. **No sube video, no guarda el archivo video en storage, ni integra cámara nativa directamente.** Las referencias `assetId` no reabren el archivo tras reinicio.
- Edición básica en la misma hoja: preparar operaciones → ver JSON de operaciones → aplicar contra línea de tiempo real, y deshacer. **No es modelo semántico ni ejecuta subtítulos automáticos/TTS/efectos.**
- Tests Node de plan, checklists, 5 videos, rechazo de clips inventados, guardas de sesión y operaciones, y CI de bundle.

### Sistema final recomendado en teléfono

```text
UI Wivra (dictado → conversación, notas de video, checklist, timeline)
       │
       ▼
Wivra Agent Controller (local, permisos por tarea)
       │
       ├── AI Provider 1: Foundation Models Apple (iOS compatible y disponible)
       ├── AI Provider 2: motor local Android (por evaluar LiteRT/llama.cpp)
       └── AI Provider 3: OpenAI/Claude por API autorizada (opt-in)
       │          NUNCA una clave privada hardcoded en el frontend.
       ▼
 Modelo devuelve plan tipado (JSON)
       │
       ├── shot_plan[]  → checklist editable, marcar grabado
       ├── inspect_media → solo activos seleccionados; thumbnails y audio
       ├── edit_operations[] → validador de PR #29
       └── optional tools futuras → ASR/TTS/subtítulos/efectos/cámara/export
       │
       ▼
Preview real / un undo por lote / archivos originales inmutables
```

**iOS posible:** Apple [Foundation Models](https://developer.apple.com/foundation-models-framework/) integra modelos en el dispositivo y **tool calling**, pero depende de compatibilidad del iPhone, Apple Intelligence encendida y modelo disponible; [`SystemLanguageModel.availability`](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel) debe comprobarse. Su framework admite proveedores externos por adaptadores; no atribuir automáticamente costo cero a APIs de terceros. [`SpeechAnalyzer`](https://developer.apple.com/documentation/speech/speechanalyzer) y `SpeechTranscriber` son candidatos para dictado/transcripción integrada. Estos APIs son **nativos Swift, no ejecutables directamente desde Safari HTML**. Requiere app iOS instalada/híbrida y bridge seguro WebKit/React Native. Si no hay modelo local, ofrecer modo textual sencillo, jamás simular comprensión completa.

**Android:** comparar motor on-device `LiteRT`, `ONNX Runtime Mobile` o `llama.cpp`, y reconocimiento de voz nativo. Modelos/pesos/licencias, español chileno, RAM, datos y batería requieren benchmark en terminal real. Mismo contrato JSON para modelo distinto.

**Cloud opcional:** ChatGPT Plus y Claude Pro **no equivalen automáticamente a crédito API**. Una conexión de OpenAI/Anthropic exige autenticación y facturación independiente, y debe implementar gateway seguro/limites de gasto o keys de usuario en Keychain/Keystore. Nunca guardar claves en HTML, localStorage, commit ni en JSON de proyecto. Si la IA necesita imágenes, solicitar consentimiento para muestras puntuales; no cargar videos grandes por defecto.

**Lugares sugeridos:** checklist genera *lugares-tipo* («fachada permitida», «letrero legible», «punto panorámico público»). Para lugares geográficos reales con ruta, usar selección de ubicación voluntaria y proveedor cartográfico con términos/licencia y resultado geocodificado, nunca sugerencias de direcciones no comprobadas. Para Whistler/Vancouver se puede proveer un proveedor de lugares dinámico después; no hardcodear el producto a esas ciudades.

### Puertas de seguridad y experiencia

1. El agente **no** puede editar nada que no figure en proyecto activo ni inventar timecodes. Si falta evidencia, primero busca, no afirma.
2. Respuestas del modelo son **datos no confiables**. Se validan en herramientas locales y se muestran como propuestas. Se puede aprobar un lote de cambios para evitar 30 confirmaciones.
3. Iniciar LIVE, publicar en redes, reemplazar/eliminar originales o compartir fotos en nube **siempre** tiene permiso adicional.
4. Al cerrar el checklist, guardar sólo plan editorial local en el navegador (no encripta ni sincroniza). No almacenar ubicaciones precisas ni tokens sin permiso. Ofrecer control futuro borrar/exportar/backup cifrado por proyecto.
5. Si las gafas transmiten LIVE, no ejecutar modelos grandes de video en paralelo sin controlar temperatura/batería. Edición posterior preferente.
6. No llamar «IA integrada y funcionando» al parser `localBasicCommand`. **Modelo real aún pendiente**.

### Pruebas de aceptación posteriores

- En iPhone: abrir Wivra, «Quiero grabar este parque en 45 segundos, cinco tomas» → checklist → marcar 2/5 → grabar la 3ª mediante cámara → comprobar que recibe archivo y la asocia a proyecto. Verificar si Safari respeta `capture`.
- Reabrir página: checklist sigue allí, pero video asociado requiere permisos / nueva selección del archivo.
- Con un video ya importado: decir con dictado teclado «Recorta clip 1 desde 2 a 8» → revisar propuesta → aprobar → línea de tiempo cambia → deshacer. **No abrir Claude.**
- Con verdadero modelo local: «Elige la mejor parte y agrega gancho»: inspeccionar muestras/voz, modelo devuelve operaciones validables; si no hay evidencia, mostrar por qué no puede concluir.
- Lugares reales: al dar permiso a ubicación, proveer sugerencias sustentadas con direcciones/resultados y ruta; nunca atribuir ángulos genéricos a establecimientos específicos.
- Seguir a **exportación audiovisual real con sonido**. En PR #38 continúa no implementada.

### Siguiente iteración estricta

1. Probar HTML/JS y cámara en Safari iPhone real; resolver controles y persistencia segura.
2. Integrar **un proveedor de modelos realmente operativo**, priorizando Apple Foundation Models en iOS elegible, con pruebas de JSON estructurado + herramienta `trim_clip` dentro de la aplicación (no copiar y pegar).
3. Conectar voz real/transcripción y modelos semánticos que analicen unos fotogramas y audio por vez.
4. Añadir exportador real y TTS/subtítulos/efectos; **no volver a multiplicar pantallas de edición ni PRs rivales**.
5. Integración IA fuera de red solo según disponibilidad; el usuario puede elegir proveedor y medir/capar costos.

— ChatGPT
