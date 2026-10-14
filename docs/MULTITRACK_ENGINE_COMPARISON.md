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

## Qué NO está probado

- Dos capas de video simultáneas en iPhone real (lo mide la prueba).
- Audio de volumen en iPhone Safari: el volumen del elemento `<video>` lo ignora iOS (fuente no verificada); en la **exportación** el volumen sí funciona (lo confirmó el propietario).
- Decodificar HEVC/.mov/CAF en Safari para importar capturas.

## Primer corte vertical sugerido (cuando el propietario lo apruebe)

2 videos + 2 audios → dividir/recortar/silenciar → guardar y reabrir proyecto → exportar con audio y video coherentes → pruebas automáticas + prueba en iPhone.
