# Motor de varias pistas: comparación y recomendación

> Solo recomendación. **No se cambia de motor sin decisión del propietario.** Decide el propietario. — Claude
> Fecha: 14-10-2026. Cada dato va marcado: **V** = verificado (con fuente) · **NV** = no verificado.

## Qué necesitamos (pedido del propietario)

Varias pistas de video (superponer, tamaño/posición, pantalla verde), varias pistas de audio (volumen, EQ, grabar voz), sincronizar tomas, exportar con audio coherente, **en un iPhone real**, gratis/abierto donde se pueda.

## Opciones

| # | Opción | Licencia | iPhone / Safari | Riesgos | Encaje |
|---|---|---|---|---|---|
| A | **Motor propio actual** (canvas + MediaRecorder + WebAudio), ampliado con `track`, `x`, `y`, `scale` | Nuestro (MIT en borrador, PR #36) | **V** (propietario): exportar varios videos y audio con volumen/silencio funciona en su iPhone. Con 2 capas simultáneas: **NV** | Tiempo real (exportar dura lo que dura el video); rendimiento con 2+ capas **NV** | Alto: sin dependencias, ya probado por el propietario |
| B | **OpenReel** (editor web abierto) | MIT (**V**, repo) | Dice Safari 16.4+ (**NV**, afirmación del proyecto); móvil "planeado" | Muchas dependencias (73), promoción de token = señal de alerta, proyecto joven | Útil como **referencia** de audio (ducking, EQ), no como base |
| C | **OpenCut** | MIT (**V**) | Móvil planeado; prueba de arrastre en iPhone falló antes (nuestra prueba) | Reescribiendo en Rust; cerrado a contribuciones | No ahora |
| D | **WebCodecs propios** (decodificar/codificar fotograma a fotograma) | API del navegador (sin licencia que gestionar) | caniuse: iOS Safari parcial 16.4–18.7, completo 26.0+ (**V**, caniuse). Qué parte falta en "parcial": **NV** | Mucho trabajo (contenedores MP4, sincronía); codecs HEVC **NV** | Futuro: exportar más rápido que tiempo real. Antes hay que medir |
| E | **ffmpeg.wasm** | LGPL/GPL según build (**NV** de la versión exacta) | Pesado en teléfono (**NV**) | Tamaño, memoria, licencia | No |
| F | **Nativo** (AVFoundation / Metal) | Apple SDK | Mejor rendimiento posible | Necesita Mac y Xcode; implica decidir app nativa/híbrida (decisión abierta del propietario) | Si se decide nativo, lo mejor; hoy no está decidido |

Diffusion Studio y MediaBunny (MPL-2.0 en una nota anterior): **NV**, volver a verificar antes de usarlos.

## Recomendación

1. **Seguir con A**: ampliar el modelo (`track`, `x`, `y`, `scale` por clip) y dibujar varias capas por fotograma en el mismo canvas, mezclando el audio con WebAudio. Es lo que ya funciona en su iPhone.
2. **Medir antes de apostar**: `app/probe.html` (página de prueba) le dice al propietario qué soporta su iPhone (WebCodecs, codecs, MediaRecorder) y si aguanta **2 videos a la vez**. Con esos números se decide D.
3. **OpenReel solo como referencia** (MIT) para ideas de audio; no se adopta.
4. **Nativo (F)** sigue abierto como decisión del propietario; si se elige, esta comparación se rehace.

## Resultado de la prueba en un iPhone real (14-10-2026) · **V** (medido por el propietario con `app/probe.html`)

Dispositivo: iPhone con iOS 27, navegador Chrome para iOS (usa el motor WebKit de Apple).

| Medición | Resultado |
|---|---|
| WebCodecs (decodificador/codificador de video y audio) | **Existen** |
| Codificación de video soportada (`isConfigSupported`) | H.264 sí · HEVC sí · VP9 sí · **AV1 no** |
| Codificación de audio | AAC sí · Opus sí |
| MediaRecorder | MP4 (H.264+AAC) sí · WebM (VP9+Opus) sí |
| WebGL2 / WebGPU / OffscreenCanvas | existen |
| **2 videos a la vez** (uno de 1936×2576, 45 MB, y otro de 474×850), dibujados en un lienzo ~4 s | Los dos avanzaron (3,69 s y 3,94 s de ~4 s) · **60 fotogramas/s** · peor tirón **29 ms** · se grabó el lienzo con las 2 capas (3,66 MB) |

Lectura (recomendación, no decisión): el motor propio **sí aguanta 2 capas de video simultáneas** en este iPhone, incluso con un video grande. Que WebCodecs exista y codifique H.264/HEVC abre la puerta a exportar más rápido que en tiempo real más adelante, pero **eso no se ha probado**: solo se comprobó que la configuración es soportada.

Límites de esta prueba: duró ~4 s; esa grabación no llevaba audio; no mide calentamiento del teléfono en videos largos; no prueba la exportación completa con 2 capas ni con audio mezclado; un solo teléfono.

## Qué NO está probado

- Dos capas de video durante varios minutos o en la exportación completa con audio (la prueba corta de 4 s sí pasó).
- Audio de volumen en iPhone Safari: el volumen del elemento `<video>` lo ignora iOS (fuente no verificada); en la **exportación** el volumen sí funciona (lo confirmó el propietario).
- Decodificar HEVC/.mov/CAF en Safari para importar capturas.

## Primer corte vertical sugerido (cuando el propietario lo apruebe)

2 videos + 2 audios → dividir/recortar/silenciar → guardar y reabrir proyecto → exportar con audio y video coherentes → pruebas automáticas + prueba en iPhone.
