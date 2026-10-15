# AgentCut Mobile Quality Lab · investigación y prueba mínima
**2026-10-13 · — ChatGPT**  
**Estado: primer componente de software experimental; NO comprime video todavía.** Se investiga la posibilidad de mayor eficiencia antes de diseñar códecs desde cero. Este PR mantiene la arquitectura web / híbrida / nativa abierta para decisión del propietario. Complementa [PR #12](https://github.com/Os-WHGo/agentcut/pull/12) (streaming/Meta) y [PR #13](https://github.com/Os-WHGo/agentcut/pull/13) (Claude, arquitectura). No fusionar a main.

## La meta expresada por el propietario

**Ejemplo real a resolver:** ~300 videos = ~200 GB, grabados entre Ray-Ban Meta y teléfono (algunos cerca de 3K y otros 4K/60). Quiere usar el teléfono para **editar rápido y con poco espacio/RAM/batería**, preservar la calidad visual y audio útil, transmitir sin agotar datos, y, **si resulta viable**, inventar alguna mejora de compresión. No prometer compresión milagrosa ni reescalado falso.

Un archivo ya comprimido **no se puede reducir arbitrariamente** a tamaño mínimo y garantizar que cada pixel/audio permanece idéntico: la compresión reversible tiene límites matemáticos; las mejoras habituales en H.265/AV1/AV2 son con pérdidas controladas perceptualmente y dependen del contenido y del codificador. También se puede evitar trabajo y datos: **no duplicar originales**, generar proxies pequeñas, buscar copias idénticas con hash, aplicar cortes seguros por copia de samples, y almacenar variantes solo cuando agregan valor.

### Cuatro conceptos que no deben mezclarse

1. **Resolución del archivo** (por ejemplo 3840×2160), FPS, HDR, bitrate y códec medidos.
2. **Resolución de captura**: desconocida a menos que se verifique procedencia/cámara/registro. Un archivo 4K pudo haber sido escalado.
3. **Calidad perceptual**: observación humana y métricas medidas con referencia: detalles, textura, letras, escenas oscuras, movimiento, audio y color.
4. **Espacio de almacenamiento y recursos**: MB/GB, tiempo de codificación, calor, batería y RAM del dispositivo.

**Nota factual:** streaming 4K auténtico por Internet existe; discos Blu-ray no son la única forma. Mucha compresión puede perjudicar fidelidad visual aun con píxeles 4K. Fuentes: [Netflix UHD](https://help.netflix.com/en/node/306), [Apple TV 4K](https://www.apple.com/apple-tv-4k/specs/).

## Repositorios, APIs y licencias verificadas, pendientes de pruebas móviles

| Recurso | Uso | Licencia comprobada | Estado |
| --- | --- | --- | --- |
| [FFmpeg](https://ffmpeg.org/ffmpeg.html) | remux / `-c copy` sin recodificación cuando compatible | **LGPL o GPL** según compilación y componentes: [licencias](https://ffmpeg.org/legal.html) | [streamcopy documentado](https://www.ffmpeg.org/ffmpeg-all.html); empaquetar y ejecutar en iPhone pendiente |
| [Apple AVFoundation](https://developer.apple.com/documentation/avfoundation/export-presets) + [VideoToolbox](https://developer.apple.com/documentation/videotoolbox) | codificación hardware H.264, HEVC y export passthrough cuando compatible | **APIs Apple propietarias**, no OSS | Disponibilidad específica por modelo, formato de origen y ritmo sostenido pendiente |
| [Android Media3 Transformer](https://developer.android.com/media/media3/transformer/transformations) | transformaciones, optimización parcial de recortes | **Apache-2.0** (AndroidX Media3) | La optimización puede recurrir a exportación normal. **ATENCIÓN PRIVACIDAD:** trims basados en edit lists pueden ocultar fotogramas preroll, no eliminarlos |
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | contenedores y exportación web | **MPL-2.0** | Safari real pendiente |
| [WebAV](https://github.com/WebAV-Tech/WebAV) | composición WebCodecs | **MIT** | Safari real pendiente |
| [SVT-AV1](https://github.com/AOMediaCodec/SVT-AV1) | codificador AV1 de última generación, perfiles perceptuales / bitrate | **BSD-3-Clause-Clear**, además aviso de patentes AOM | [changelog 4.2.0, julio 2026](https://github.com/AOMediaCodec/SVT-AV1/blob/main/CHANGELOG.md); CPU, energía y velocidad móvil pendientes |
| [rav1e](https://github.com/xiph/rav1e) | codificador AV1 alternativo | **BSD-2-Clause** | rendimiento móvil pendiente |
| [dav1d](https://github.com/videolan/dav1d) | decodificador AV1; **no codificador** | **BSD-2-Clause** | plataforma pendiente |
| **AV2** [especificación](https://av2.aomedia.org/) + [AVM](https://github.com/AOMediaCodec/avm) | estándar sucesor de AV1 + encoder/decoder experimental de referencia | AVM **BSD-3-Clause-Clear** con licencia de patentes AOM, [LICENSE](https://github.com/AOMediaCodec/avm/blob/main/LICENSE) | **AV2 v1 publicado mayo/junio 2026; ningún soporte móvil realtime/hardware se confirmó**, por eso solo I+D |
| [Netflix VMAF](https://github.com/Netflix/vmaf) | comparar calidad perceptual respecto de referencia y estimar tradeoffs | **BSD-2-Clause-Patent** (fuente exacta [LICENSE](https://github.com/Netflix/vmaf/blob/master/LICENSE)) | métricas VMAF v1 lanzadas junio 2026; evaluación humana obligatoria |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | detección de cambios de escenas para decidir presupuesto de bits | **BSD-3-Clause** | Python/OpenCV no nativo en teléfono automáticamente |
| [Apple Files + almacenamiento externo](https://support.apple.com/en-ca/guide/iphone/iphe9aff429a/27/ios/27) | mover/guardar originales en SSD USB-C, conservar trabajo liviano en el iPhone | función del sistema; no librería abierta | Apple documenta acceso por Archivos; integración directa en AgentCut depende de permisos y OS |

Todas las licencias anteriores son **del proyecto/código indicado**, no garantizan compatibilidad de patentes, SDK Meta, modelos, dependencias, formatos en tiendas o distribución sin obligaciones adicionales. **No se importó ninguna** librería ajena en el código de esta prueba.

## Propuesta: AgentCut Media Efficiency Engine (AMEE), componentes reutilizables

**No inventar un códec incompatible antes de medir.** La innovación viable más rápida sería inventar un sistema de *planificación y distribución adaptativa* que escoja códec, ajustes y flujo de datos óptimos para una biblioteca mixta y un teléfono concreto. Primera versión en `quality/quality-planner.mjs`:

```
Asset metadata (medido) + provenance (si verificada)
     ↓
Quality Planner (código experimental que ya existe)
     ├── preview: proxy ligera 720p máximo, conservando original
     ├── archive: conservar o planificar HEVC/AV1 según hardware verificado
     ├── publish/live: elegir solo encoder compatible comprobado
     └── Scene Budget: asignar mayor objetivo de bits a escenas
                        con movimiento/detalle/texto importantes
     ↓
FUTURO: encoder hardware / FFmpeg / AV1 / AV2 experimental
     ↓
FUTURO: evaluar tamaño real + VMAF + prueba visual/audio + calor/batería
     ↓
FUTURO: resultado propuesto y confirmación del propietario
```

Este primer código funciona **sin librerías** y ofrece:
- `inspectAsset`: tamaño, resolución del archivo, duración y Mbps aproximados (no confunde 4K de archivo con captura 4K real).
- `proxySize`: dimensiones de un posible proxy **sin reescalar hacia arriba**.
- `planExport`: un camino propuesto con `keep_original`, `edit_proxy`, `encode_and_measure` y `stream_copy_after_verification`; no pretende conocer codecs hardware que no hayan sido verificados.
- `allocateSceneBudget`: *experimento original*, reparte un presupuesto de Mbps entre escenas con diferentes grados de movimiento, detalle y texto; **aún no controla un codificador** y no garantiza bitrate real.
- `hypotheticalSavings`: cálculos ilustrativos para la biblioteca de ~200GB, claramente etiquetados como supuestos.

`quality/index.html` es una página local simple para inspeccionar desde el navegador del teléfono. **NO sube, no exporta, no recodifica ni elimina nada**. Su utilidad es recoger métricas reales de un video y permitir probar un plan transparente. Test: `node --test quality/tests/planner.test.mjs`.

## Cómo reducir RAM y costos de verdad

1. Trabajar con **referencias a los originales**, no duplicarlos en proyectos. Mantener manifests/edits como JSON con timecodes.
2. Miniaturas solo bajo demanda y **proxy temporal** 480p/720p si es necesaria, con caché limitada/eliminable. Los proxies **agregan** espacio mientras existan; solo hacen la edición más rápida. El original sigue disponible para exportación de máxima calidad.
3. Detectar **duplicados byte a byte** con hashes en streaming; sugerir eliminar solo después de comparar/verificar por el usuario. Los videos visualmente similares pero distintos **no son duplicados perfectos**.
4. Cortar con **stream copy** cuando sea seguro para el contenido y destino: [FFmpeg dice](https://www.ffmpeg.org/ffmpeg-all.html) que evita decodificar/recodificar. **No usar** trims con preroll oculto para ocultar información privada: [advertencia de Android](https://developer.android.com/media/media3/transformer/transformations).
5. Optimizar con **GPU/ASIC del teléfono** antes de instalar encoders software pesados: Apple VideoToolbox / Android MediaCodec. La CPU más potente no sustituye un codificador hardware bajo temperatura y batería.
6. En directo, codificar video para streaming y guardar copia local. Si un segundo encoder hardware no se sostiene, **guardar la misma pista comprimida del stream**. Evitar convertir de nuevo en tiempo real en el teléfono.
7. No multiplicar resolución ni FPS artificialmente, no reinterpretar SDR como HDR nativo, no borrar masters ni metadatos relevantes. Si exportación 4K reescalada, indicar su verdadera procedencia.
8. Opción de SSD externo para originales, pero requiere conexión física y permisos; si no hay un original accesible, AgentCut NO debe fingir exportación de alta calidad desde proxy.

## Por qué un iPhone no ejecuta automáticamente Age of Empires de Windows 95

No es falta de potencia. El videojuego fue diseñado para **otra arquitectura de instrucciones y otro sistema operativo** (x86 + interfaces Win32/gráficos/drivers de la época). El iPhone usa chips ARM y iOS, otros permisos, API gráfica y controles. Necesita port/remake o emulación/traducción con sus costos de compatibilidad y rendimiento. **Existe UTM SE para iPhone**, emula máquinas x86 y otros procesadores (App Store: https://apps.apple.com/ca/app/utm-se-retro-pc-emulator/id1564628856); eso **no garantiza** que Age of Empires corra bien o legalmente sin el juego original. Exactamente igual, un iPhone puede tener un chip superior a uno de escritorio antiguo y aun así no poder ejecutar un compresor de PC sin adaptación, biblioteca y hardware habilitado.

## Hoja de prueba concreta para videos 3K / 4K60 de Ray-Ban Meta e iPhone

**El experimento de compresión real todavía debe desarrollarse y probarse en hardware**. Elegir 3 videos de 10–30 segundos, sin datos íntimos: ciudad estática, movimiento rápido, noche con ruido, mezclando si hay 3K y 4K60. Registrar para cada uno:
- resolución real del archivo, FPS, HDR SDR, audio, códec/bitrate, bytes y duración;
- preview proxy para comprobar que navegar y cortar es fluido;
- 2 o 3 opciones soportadas en ese hardware: H.264, HEVC, AV1 (AV2 solo laboratorio si hay runtime, no para distribuir);
- tamaño final, VMAF contra original cuando la plataforma permita y observación lado a lado, degradación del audio, color y subtítulos;
- tiempo, batería, RAM, temperatura y si teléfono dejó de responder;
- tamaño/rendimiento de **toda** la biblioteca solo como extrapolación medida, nunca promesa.
- comparación con «conservar original». Si no hay mejora perceptual/tamaño tangible, no gastar energía en transcoding.

**Criterio de éxito:** resultado más pequeño **para igual calidad visual/acústica aceptada** y tiempo/temperatura/batería sostenible. Si un material ya está en HEVC eficiente, comprimir otra vez puede empeorarlo: conservarlo sin cambios. Hacer 300 pruebas de golpe sería una mala idea: primero 3 clips, después lote de 10, luego la biblioteca.

## Pendientes para Claude

- Revisar la **lógica** y tests de Quality Planner, evitando tratar un “plan” como codificador implementado.
- Comparar con [PR #13 arquitectura](https://github.com/Os-WHGo/agentcut/pull/13); elegir qué backend portable y plugin codec nativo se puede construir con menor esfuerzo para iPhone y Android.
- No exigir Mac propio para **ver el experimento web** (requiere solo hosting temporal HTTPS), pero **un módulo iOS nativo suele necesitar macOS/Xcode y firma**, o verificar un servicio de compilación remoto.
- Documentar primero un build funcional capaz de abrir/exportar en un teléfono antes de integrar AV2/ML.
- Registrar el problema concreto de 300 videos / 200 GB como caso de uso y prioridad de diseño. **No fusionar ninguna PR sin autorización del propietario.**

— ChatGPT
