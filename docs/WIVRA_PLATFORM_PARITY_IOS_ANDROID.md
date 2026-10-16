# Wivra · regla de paridad entre iOS y Android

**Decisión del propietario, 15 de octubre de 2026.**
La cámara de las gafas **Ray-Ban Meta debe estar disponible tanto en Android como en iOS**. Una diferencia entre Swift, Java o Kotlin NUNCA significa que se elimine una función de la plataforma. El editor, Director, AutoCut, LIVE y biblioteca son un solo producto Wivra, con contratos compartidos.

## Fuente de verdad y matriz de paridad

| Función | iOS | Android | Regla de entrega |
| --- | --- | --- | --- |
| Cámara móvil, grabación y fotografías | Código Swift/AVFoundation prototipo | PENDIENTE de módulo CameraX | No anunciar lanzamiento paritario hasta probar ambas |
| Ray-Ban Meta video/preview | Meta DAT iOS 1.0.1; prototipo | Meta DAT Android 1.0.1, dependencia añadida; conexión PENDIENTE | Las dos plataformas ofrecerán integración con gafas compatibles |
| Fotos por Ray-Ban y durante video | Según disponibilidad del SDK; probar | Según disponibilidad del SDK; probar | No simular capacidades ni prometer funciones experimentales |
| Audio Ray-Ban, AirPods, USB/DJI/Bluetooth | Adaptadores y pruebas parciales | Adaptadores Android PENDIENTES | Mostrar entradas detectadas realmente, rutas reales y límites del SO |
| Video con audio + pista independiente | Prototipos MOV/CAF y manifests v2 | PENDIENTE contrato equivalente | No duplicar audio ni inventar canales separados |
| Biblioteca y captura organizada por día | Prototipo nativo y esquema de manifest | PENDIENTE adaptador nativo | IDs/proyectos y formato de importación iguales |
| Editor, filtros, plantillas, Director, AutoCut | Motor JS de Claude compartido | Mismo motor JS empaquetado | Mismos comandos, idiomas, formatos y semántica |
| LIVE/escenas/destinos | Prototipos de preflight; transmisión real pendiente | PENDIENTE | Mismo alcance de producto, no publicar desde APIs no autorizadas |

**Estado real:** en Android existe actualmente el shell Java/WebView del Editor, y ahora las dependencias DAT oficiales están declaradas en Gradle. No hay sesión de gafas activa ni cámara móvil Android conectada todavía. En iOS hay más código nativo, pero tampoco se puede inferir que funcione en todas las gafas sin prueba física.

## Contratos y privacidad
- Kotlin para módulos Android nuevos cuando se justifique; no migrar Java ni JS solo para cambiar un lenguaje. Swift para funciones nativas iOS.
- El mismo proyecto, timeline, checklist y lógica de Director funcionan sobre JS compartido.
- Bridge nativo para recursos de cámara/biblioteca con permisos, IDs estables y mínimos datos necesarios; ningún archivo privado se envía a servidores.
- DAT SDK tiene **Developer Terms** de Meta, no es una biblioteca de código abierto de licencia MIT. Registro y autorización pueden ser requisitos para probar o distribuir una integración.
- En Android se ha configurado exclusión de analíticas y capturas de errores propias del DAT SDK según las opciones documentadas; revisar cualquier política de datos nueva en versiones futuras.
- La documentación de Meta describe audio de cámara y fotos especiales como experimentales con posibles límites de distribución. Igualdad de objetivos NO implica capacidad universal del hardware.

## Referencias oficiales
- Meta Android SDK: https://github.com/facebook/meta-wearables-dat-android
- Meta iOS SDK: https://github.com/facebook/meta-wearables-dat-ios
- Documentación Wearables: https://wearables.developer.meta.com/docs/develop/

## Aceptación de paridad
1. Una app en ambas plataformas abre Editor con las mismas funciones de proyectos.
2. La cámara móvil captura video y foto y devuelve medios al mismo editor.
3. Con hardware compatible y permiso, ambas apps ofrecen conexión y preview Ray-Ban mediante SDK oficial.
4. Audio externo y guardado separado se verifican por dispositivo/sistema; si una combinación no está admitida, la interfaz informa honestamente y da alternativa.
5. Importar, editar, guardar/reabrir y exportar un proyecto equivalente se prueba en dispositivos iOS y Android.
6. Limitaciones de SDK/distribución se verifican ANTES de anunciar funciones; no se excluye Android de la hoja de ruta.
7. Este documento es contrato de producto, **no prueba de que la paridad ya existe**.
