# Wivra: selección de repositorios para la app unificada (15-oct-2026)
**Investigación, no dependencias instaladas.** Verificar versiones, licencias, plataforma y mantenimiento al momento de adoptar. Wivra no depende de ninguno para editar videos y tomar fotografías de forma local.

| Necesidad | Repositorio oficial | Licencia / caveat | Resolución inicial |
| --- | --- | --- | --- |
| Editor web dentro de app iOS/Android | https://github.com/ionic-team/capacitor | MIT; plugin nativo Swift/Kotlin; necesita plan de migración del host existente | **Evaluar después del primer iOS integrado**; no reescribir editor para cambiar framework ahora |
| Generador del proyecto iOS | https://github.com/yonaskolb/XcodeGen | MIT; ya usado por el prototipo nativo | **Mantener** durante integración iOS |
| Gafas Meta, cámara y audio | https://github.com/facebook/meta-wearables-dat-ios | **Developer Terms, NO licencia MIT libre**; límites de preview, registro y distribución | **Ya integrado como SDK** en iOS B0; permisos físicos/SDK por validar |
| Gafas Meta en Android | https://github.com/facebook/meta-wearables-dat-android | Developer Terms; sample CameraAccess y MockDeviceKit | **Investigar e integrar Android por etapas**; no reimplementar DAT desde cero |
| Mapas interactivos opcionales | https://github.com/maplibre/maplibre-native | BSD-2; SDK nativos | Futuro, solo con mapas/datos legales y paquete descargado por el usuario |
| Mapas empaquetados sin API paga | https://github.com/protomaps/PMTiles | Implementaciones BSD-3, especificación CC0; tile datasets pueden tener otras licencias | P2, validar atribución OSM/ODbL y tamaño de descarga |
| Mapas y estilos base | https://github.com/maplibre-ext/protomaps-basemaps | Código BSD-3, estilos CC0, **teselas ODbL (OpenStreetMap)** | Referencia de estilos; respetar atribución y restricciones de distribución |
| Comprensión de órdenes transcritas (ASR) | https://github.com/ggml-org/whisper.cpp | Código MIT, **pesos del modelo con condiciones propias**; memoria/CPU en iPhone y Android | P2 para dictado/transcripción offline, medir rendimiento antes |
| Extraer ritmo y rasgos de sonido | https://github.com/meyda/meyda | MIT; WebAudio, análisis offline; no ofrece por sí mismo una canción licenciada | P1/P2 para AutoCut sin servidor |
| Transiciones de video | https://github.com/gl-transitions/gl-transitions | Repositorio MIT; **cada shader puede tener licencia particular** | Explorar puñado de transiciones cuyo preview/export coincida |
| Motor de export/codec adicional | https://github.com/FFmpeg/FFmpeg | LGPL/GPL según configuración, códecs y distribución; muy complejo en App Store | **NO incorporar ahora**; medir editor existente y AVFoundation primero |
| OpenStreetMap POI/rutas offline | https://github.com/valhalla/valhalla | MIT para motor; datos OSM con atribución y tamaño/costos de hosting | Futuro; primeras rutas siguen el orden proporcionado por el usuario |

## Decisión pragmática
El host SwiftUI nativo de Wivra se desarrolla junto con el **HTML único de Claude** en la misma app iOS. Android, si no se usa Capacitor, puede ofrecer contenedor nativo con el mismo HTML y módulos DAT Android. **No existe aún un puente seguro completo ni instalación distribuible.**

No traer una gran dependencia por una sola transición ni copiar plantillas de CapCut/Premiere. Los paquetes descargables contienen **recursos/datos licenciados** que entiende un motor ya instalado, no nuevas capacidades ejecutables. Las bibliotecas de música de Instagram/TikTok/Meta no se pueden descargar ni relicenciar para Wivra.

## Gastos prohibidos en fase inicial
No habilitar Google Maps Places/Routes con facturación, pago automático por créditos, OpenAI/Anthropic API bajo clave del propietario ni infraestructura cloud de pago. La disponibilidad de código abierto no garantiza hosting gratuito; navegación externa y planes de lugares escritos por usuario funcionan sin API.

## QA obligatorio por paquete de terceros
Licencia original + de cada recurso; retención de avisos; checklist de seguridad; tamaño en MB y memoria RAM; soporte iOS/Android; preview = export real; offline tras descarga; test sin internet; no se importa si exige cuenta/compra.
