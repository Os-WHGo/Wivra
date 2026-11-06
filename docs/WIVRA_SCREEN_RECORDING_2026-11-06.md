# Wivra · Grabar pantalla sin transmitir (Android 2A · iPhone 1A)

Decisiones del propietario: 2A (Android) y 1A (iPhone). Rama W99 (Android) y W100 (iPhone). — Claude

## Qué hace

| | Android (W99) | iPhone (W100) |
|-|-|-|
| Dónde se abre | Fuentes → Cámara → «Grabar pantalla (sin transmitir)» (solo la edición completa) | Inicio → «Grabar pantalla» |
| Qué graba | La pantalla completa o la app que elijas en el diálogo de Android | Toda la pantalla, también otras apps (extensión ReplayKit) |
| Sonido | Tu micrófono, si marcas la casilla | El sonido de las apps y, si lo activas en la hoja de iOS, tu micrófono, en **dos pistas separadas** |
| Archivo | MP4 H.264, hasta 1920 px en el lado largo, 30 fps | MOV H.264 a la resolución de la pantalla y M4A para cada sonido |
| Antes de guardar | Queda en la carpeta privada de Wivra: Guardar en Galería, Después o Eliminar | Queda en la carpeta compartida de Wivra: «Pasar a Wivra» o Eliminar |
| En el editor | Importar → video del teléfono | Importar → Grabaciones de Wivra (se importan video y pistas de sonido con su desfase medido) |
| Transmisión | Nunca | Nunca |

## Límites reales

**Android**
- Android pide permiso cada vez (MediaProjection). **Verificado** en la documentación de Android 14 (consentimiento por sesión) y aplicado igual que en el LIVE de pantalla.
- El contenido protegido (por ejemplo, apps con `FLAG_SECURE` o video con DRM) se ve negro. **Verificado** (comportamiento del sistema).
- No graba el sonido interno de otras apps: no se implementó (Android lo permite solo a apps que lo autorizan). **Decisión de alcance**, no un límite del sistema.
- Se detiene sola si queda menos de 300 MB + 1 minuto libre, y conserva lo grabado. Es una regla de Wivra.

**iPhone**
- La única forma de grabar otras apps es una **extensión ReplayKit Broadcast Upload**. **Verificado**: API `RPBroadcastSampleHandler` y `RPSystemBroadcastPickerView` de Apple.
- La inicia y la detiene la persona desde iOS (botón de Wivra o Centro de control), y el indicador rojo siempre se ve. Wivra no puede iniciarla sola.
- El contenido protegido (DRM, algunas apps de video o de bancos) se graba negro; las apps pueden detectar la grabación y ocultarse. **Verificado** (comportamiento del sistema).
- Memoria de la extensión: unos **50 MB**. **Reportado por terceros** (OpenTok, guías de ReplayKit); Apple no publica la cifra. Por eso los cuadros van directo al codificador o se descartan, nunca se acumulan.
- La cámara de Wivra no se puede usar mientras se graba la pantalla.
- Si se gira el iPhone durante la grabación, el video conserva la orientación inicial. **No verificado en teléfono**: la rotación depende de una etiqueta de ReplayKit que hay que comprobar.
- Si iOS corta la extensión de golpe, el video se recupera hasta el último fragmento (cada 2 s). **Medido en macOS (W108)** con el mismo escritor y cuadros sintéticos: con un corte a los 3,5 s se recuperan 2,07 s legibles, que pasan el verificador de Wivra. El sonido de ese corte puede perderse, porque el M4A no se escribe por fragmentos.
- Firma: la extensión y la app comparten un **App Group** (`group.com.oswhgo.WivraMetaB0`). **Verificado** en la tabla oficial de Apple «Supported capabilities (iOS)»: App Groups está disponible también para la cuenta gratuita («Apple Developer»). La extensión es un segundo App ID, lo que cuenta para el límite de App IDs de la firma gratuita. **No verificado** si AltStore crea el App Group al firmar.
- El simulador de iOS no permite probar la grabación real; en el CI solo se compila y se fotografía la pantalla.

## Pruebas físicas pendientes (beta)

**Android**
1. Grabar 1–2 minutos de otra app con micrófono.
2. Detener desde la notificación → Guardar.
3. Importar en el editor y comprobar imagen, sonido y duración.

**iPhone**
1. Inicio → Grabar pantalla → botón → Wivra → micrófono encendido → Iniciar.
2. Abrir otra app con sonido y hablar 1–2 minutos.
3. Detener con el indicador rojo.
4. Volver a Wivra → Pasar a Wivra.
5. En el editor: Importar → Grabaciones de Wivra. Comprobar que el video y las dos pistas (app y micrófono) quedan alineados.
6. Repetir girando el iPhone y anotar la orientación.

**Ambos:** grabar 20 minutos para medir el espacio usado y la temperatura.

Ningún resultado de CI sustituye estas pruebas.
