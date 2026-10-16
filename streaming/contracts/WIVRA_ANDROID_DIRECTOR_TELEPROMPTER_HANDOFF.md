# Wivra · Editor Director → cámara física Android (teleprompter)

**Fecha:** 16-10-2026 · **Bloque beta ya aprobado en alcance #121** · ChatGPT, área `streaming/`

## Una sola fuente de guion

El editor único de Claude guarda el checklist de Director en `app/template.html` mediante:

- `localStorage['agentcut-shoot-checklist-v1']`, esquema `agentcut-shoot-plan-v0.1`.
- Tomas `shootPlan.shots[]` con `title`, `script` y `state`.
- Los guiones de toma se actualizan primero en el editor. La cámara NO los escribe ni altera estados.

Al pulsar voluntariamente **Cámara del teléfono** en Wivra Android, el host `MainActivity.java` consulta ese registro **solo en la página empaquetada `file:///android_asset/agentcut.html`**. Se descartan entradas no válidas, se toman hasta 30 guiones no vacíos de tomas `todo`/`retry` y se muestra un selector con opción **«Sin guion»**. Solo la toma elegida viaja al Intent de `WivraPhoneCameraActivity` mediante `EXTRA_SHOT_SCRIPT`, con límite de 2200 caracteres.

Este mecanismo no usa `addJavascriptInterface`, servicios externos, Internet ni suscripciones. La lectura sucede por pulsación del usuario y permanece local al WebView. Si no hay checklist, el usuario abre normalmente la cámara sin teleprompter.

## Teleprompter visible, pero fuera del MP4

En `WivraPhoneCameraActivity.kt` el texto se dibuja con widgets Android `FrameLayout + ScrollView + TextView` **encima de** `PreviewView`, en modo compatible para evitar que el preview oculte la capa en algunos dispositivos.

- Botón iniciar/pausar.
- 100, 140 o 180 palabras/minuto.
- Tamaño del texto entre 20 y 44 sp.
- Mostrar/ocultar la capa.
- Se pausa al minimizar la pantalla o destruir la actividad. El tiempo de lectura guía no se graba.
- **CameraX ImageCapture y VideoCapture registran los fotogramas de cámara, no la jerarquía Android View**: el texto de la superposición NO se incluye intencionalmente en la foto o MP4.

**No** es reconocimiento de voz, manos libres mediante audífonos, teleprompter Ray-Ban, teleprompter del iPhone ni progresión automática de tomas. Tampoco asigna por sí solo el archivo grabado a `shot.assetId`; Claude mantiene la asociación desde el editor único. Son requisitos de la beta integral que se están cerrando por separado.

## Prueba física obligatoria

1. Abrir Director de Wivra Android, crear una producción con un guion de toma y guardarla.
2. Pulsar Cámara del teléfono → aparecen la toma pendiente con guion y Sin guion.
3. Elegir toma, autorizar cámara → aparece guion visible sobre la vista previa, botones de tamaño/velocidad/pausa.
4. Grabar MP4 y abrirlo en Fotos/otro visor: **el texto NO debe estar quemado sobre el video**.
5. Minimizar, volver y comprobar que el teleprompter no se mueve mientras está en segundo plano.
6. Elegir «Sin guion» → cámara normal sin capa. Probar guion largo de 2200 caracteres y guion vacío.
7. Guardar MP4, importarlo al editor único y verificar audio y export; marcar la toma Hecha solo al confirmar que se grabó.

**Estado:** código y tests automatizados disponibles en PR #128; **sin prueba en teléfono ni gafas físicas**. Los APK debug son de QA; IPA iPhone siempre requiere firma Apple.

**Reglas de integración:** no fusionar `main` sin aprobación; no modificar `app/`/`core/` de Claude a ciegas. Si Claude cambia las claves o el esquema de checklist, actualizar este contrato y test en un PR revisado, no leer por heurística estructuras arbitrarias.
