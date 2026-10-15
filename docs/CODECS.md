# Video liviano sin perder calidad: qué existe y qué conviene

> **Investigación de Claude, 13 oct 2026.** **[V]** verificado en la fuente enlazada; **[NV]** no verificado (a veces es conocimiento general mío). Nada se midió en un teléfono real.

## Respuesta corta

**No hace falta inventar un códec nuevo, y inventar uno no serviría para Reels:** Instagram, TikTok, YouTube y el reproductor del teléfono solo entienden códecs estándar. Lo que sí ahorra peso y datos sin perder calidad visible es **usar bien los códecs que ya existen** y **evitar recomprimir**. Eso se puede hacer en AgentCut con código propio y herramientas abiertas.

## Los códecs que existen

| Códec | Ventajas | Límites en teléfono | Estado |
| --- | --- | --- | --- |
| **H.264** | Lo aceptan todas las plataformas | Pesa más que los nuevos | Referencia |
| **HEVC (H.265)** | Aprox. 40 % menos datos que H.264 con la misma calidad (cifra de un estudio de **2018**, supuesta, no medida por mí) | Los iPhone lo graban y codifican por hardware **[NV]** (conocimiento general). Las gafas Meta entregan HEVC (`hvc1`) **[V]**. YouTube lo acepta por RTMP/RTMPS **[V]**. Hay patentes con cobro **[NV]**; usar el codificador del teléfono suele evitar el problema, pero eso es **[NV legal]** | Mejor equilibrio hoy |
| **AV1** | Libre de regalías según su alianza **[NV]**; en un estudio de 2018 igualaba a x264 con ~55 % de los datos; YouTube lo acepta por RTMP/RTMPS **[V]** | iPhone 15 Pro y posteriores **decodifican** por hardware **[V]**. Según Bitmovin los chips de Apple **no codifican** AV1 por hardware **[V]**, pero ese artículo es anterior a 2026 y **no sé si los chips nuevos cambiaron eso [NV]**. Codificar por software es lento y gasta batería. Safari en iPhone: soporte **parcial** desde iOS 17 **[V]** | Sirve para exportar y guardar si la plataforma lo acepta; no para transmitir desde el teléfono |
| **VVC (H.266)** | Aún más compacto | Sin soporte en teléfonos ni navegadores que yo haya verificado **[NV]** | Descartado |
| **Códecs neuronales (investigación)** | DCVC-RT: ~125 cuadros/s de codificación a 1080p y ~21 % menos datos que H.266 **[V, resumen del artículo]**. MobileNVC: decodifica 1080p en tiempo real en un móvil, hasta 48 % menos datos que el códec previo del propio móvil **[V, resumen]** | El código de DCVC es MIT pero pide GPU NVIDIA con CUDA **[V]**. De MobileNVC no vi código ni licencia **[NV]**. Nadie más puede reproducir esos archivos | Seguirlo como investigación, no usarlo |

Fuentes: [caniuse AV1](https://caniuse.com/av1), [Bitmovin](https://bitmovin.com/blog/apple-av1-support), [YouTube](https://support.google.com/youtube/answer/2853702), [DCVC-RT](https://arxiv.org/abs/2502.20762), [DCVC](https://github.com/microsoft/DCVC), [MobileNVC](https://arxiv.org/abs/2310.01258), [comparativa 2018](https://streaminglearningcenter.com/wp-content/uploads/2018/05/Comparing-AV1_VP9_HEVC_H264_final.pdf), [RootEncoder](https://github.com/pedroSG94/RootEncoder).

## Dónde se ahorra de verdad

1. **No recomprimir.** Cortar en los puntos donde el video ya tiene cuadros completos se hace copiando datos, sin perder nada y casi sin gasto de batería. Solo se recodifica lo que realmente cambia (un texto encima, un cruce). **[NV]** que Mediabunny lo haga bien en Safari; es lo primero que habría que probar.
2. **Calidad objetivo en vez de peso fijo.** Pedir "esta calidad" en lugar de "tantos Mbps" deja que lo fácil pese poco y lo difícil pese más. **[NV]** que Safari lo permita con WebCodecs.
3. **Tope realista para Reels:** 1080×1920 y 30 cuadros/s. Subir más no se ve en el teléfono y las plataformas lo vuelven a comprimir **[NV]**. Las gafas Meta ya entregan como máximo 720×1280 **[V]**.
4. **Exportar una sola vez en buena calidad:** como cada red social vuelve a comprimir, subir un archivo ya muy comprimido empeora el resultado final **[NV]**.
5. **Datos hacia la IA:** nunca enviar el video. Enviar un fotograma cada 2 o 3 segundos a baja resolución más el texto de la transcripción. Es la mayor reducción posible de datos y de costo (issue #6).
6. **Transmitir en vivo:** H.264 es lo más seguro para todas las plataformas. HEVC o AV1 solo donde esté confirmado (YouTube **[V]**; RootEncoder soporta HEVC y AV1 por RTMP mejorado **[V]**, pero que Twitch, Kick, TikTok o Instagram los acepten es **[NV]**). El audio en AAC u Opus.

## Prueba pequeña propuesta (para el iPhone del propietario)

Exportar **el mismo clip** de 22 segundos con cada opción disponible en Safari (H.264, HEVC si lo permite, AV1 si lo permite), anotar tamaño, tiempo, batería aproximada y si se ve igual. Es parte del plan B de exportación (issue #11). Resultado esperado: una tabla real en vez de cifras de 2018.

— Claude
