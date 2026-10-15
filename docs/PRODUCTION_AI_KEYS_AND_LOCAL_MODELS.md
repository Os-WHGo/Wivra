# Wivra · claves de IA seguras en producción y modelo local en iPhone
**13 oct 2026 · — Claude** · Estado: investigación + ejemplo probado con simulacros. **Nada de esto está desplegado.**
Etiquetas: **[V]** verificado con fuente · **[NV]** no verificado.

## 1. Por qué la clave no puede ir dentro de la app
- Google lo dice así: «Never expose keys client-side in production», «Do not hardcode API keys directly in web or mobile apps», «Keys compiled in client-side code can be extracted by users», y recomienda «run a backend proxy server to make the actual API calls». **[V]** https://ai.google.dev/gemini-api/docs/api-key
- Hoy la app deja que cada persona pegue **su propia clave** (solo en memoria). Sirve para pruebas y para quien quiera usar su cuenta; **no sirve** para dar IA a otras personas sin que cada una cree una clave.

## 2. Arquitectura recomendada para producción
```
Teléfono (Wivra)  ──►  Intermediario de Wivra (servidor)  ──►  Proveedor de IA (Gemini u otro)
   solo manda: petición +                tiene la clave como SECRETO del servidor
   resumen del proyecto (nunca video)    valida, limita, y reenvía
```
El intermediario de ejemplo está en `backend/ai-proxy/worker.mjs` (7 pruebas con simulacros). Hace:
1. Acepta solo orígenes permitidos (CORS) y solo `POST /v1/chat/completions`.
2. Acepta solo la herramienta `edit_apply`, solo modelos de una lista, sin streaming, máx. 32 KB y 30 mensajes.
3. Ignora cualquier clave que mande el cliente y usa la suya (secreto del servidor).
4. Limita peticiones por minuto por IP.
En la app, el proveedor «Otro (compatible con OpenAI)» ya puede apuntar a `https://TU-SERVIDOR/v1/`.

**Lo que falta y es decisión tuya (no lo asumo):**
| Tema | Opciones | Nota |
|---|---|---|
| Quién puede usar la IA | (a) cada persona con su clave · (b) cuentas con inicio de sesión + cupo diario · (c) abierta con límites duros | Sin identificar personas, un límite por IP se evade; (b) es lo sano. **[NV]** qué sistema de inicio de sesión conviene |
| Dinero | tope de gasto en la cuenta del proveedor + cupo por persona | Sin tope, un abuso cuesta dinero real |
| Dónde corre | Cloudflare Workers u otro | Plan gratis: 100.000 peticiones/día y 10 ms de CPU por invocación; plan de pago desde 5 USD/mes **[V]** https://developers.cloudflare.com/workers/platform/pricing/ |
| Límite real compartido | Durable Object / binding de límite de Cloudflare | El ejemplo cuenta **por instancia**: no es suficiente en producción **[NV]** |
| Privacidad | decir en la app qué se envía y a quién | Hoy: petición + resumen (id, nombre, duración, cortes). Nunca el video |

## 3. Apple Foundation Models (IA local en iPhone compatible)
Lo verificado en la documentación de Apple **[V]** (https://developer.apple.com/documentation/foundationmodels.md):
- Es un framework **de Swift** con llamadas a herramientas (`Tool`) y salida estructurada (`@Generable`).
- Requiere un dispositivo compatible con Apple Intelligence.
- Los modelos en el dispositivo sirven para resumir, extraer, refinar, diálogo; para más razonamiento y contexto Apple ofrece Private Cloud Compute o un proveedor de servidor.
- Tiene un protocolo de **proveedor de modelo propio** (`LanguageModel`), por ejemplo para correr un modelo abierto exportado con Core AI.
- Contexto máximo del modelo local: **4096 tokens** (iOS 26.4 RC, marzo 2026); las definiciones de herramientas cuentan dentro de ese límite **[V]** https://infoq.com/news/2026/03/apple-foundation-models-context

**Consecuencias para Wivra:**
1. **No se puede usar desde una página web en Safari.** No encontré una API web que lo exponga **[NV]**. Haría falta una app instalada (Swift, o una cápsula híbrida tipo Capacitor con un puente propio). Eso es la decisión «web, híbrida o nativa» de `docs/ARCHITECTURE.md`, que sigue sin decidir.
2. **Mismo contrato:** el modelo local debe llamar a la misma herramienta `edit_apply` y pasar por el mismo validador. Cambia el proveedor, no el editor.
3. **Ventana pequeña:** con 4096 tokens hay que enviar un resumen mínimo del proyecto (no todos los clips con todos los campos) y partir tareas largas. Probar con un proyecto de 5 videos.
4. **Calidad en español, velocidad y batería:** **[NV]**, solo se sabe probando en tu iPhone (y confirmar que tu modelo de iPhone es compatible).
5. **Android** necesita otro motor local (a evaluar: LiteRT, ONNX Runtime Mobile, llama.cpp) con el mismo contrato **[NV]**.

## 4. Orden sugerido (sin bloquear nada)
1. Ahora: Gemini con clave propia (ya integrado) → medir si ejecuta bien las operaciones.
2. Cuando decidas la forma de la app: desplegar el intermediario con cupo por persona (nunca claves dentro de la app).
3. En paralelo, solo si hay app nativa/híbrida: prototipo Apple Foundation Models con `edit_apply` y 5 videos de prueba en tu iPhone.

— Claude
