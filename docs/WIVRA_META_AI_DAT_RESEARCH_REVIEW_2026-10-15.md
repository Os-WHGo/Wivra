# Wivra | Revisión del informe Meta AI DAT 1.0.1

Fecha del informe compartido por el propietario: 2026-10-15. Fuente: texto aportado por el usuario, que recoge investigación de documentación Meta y GitHub. No equivale a pruebas físicas de Wivra.

## Verificado en fuentes oficiales
- DAT 1.0.1 (9-oct-2026) corrigió corrupción de buffers HEVC y retardos del video Stream. https://github.com/facebook/meta-wearables-dat-android/blob/main/CHANGELOG.md
- DAT 1.0 es una versión del Toolkit estable; las capacidades **experimentales** todavía no se pueden publicar en aplicaciones según el CHANGELOG. FAQ: https://developers.meta.com/wearables/faq/
- Las seis familias experimentales 1.0 del CHANGELOG son Inputs, Motion, Speech, Voice invocations, fotografía independiente de alta calidad y audio PCM de cámara. No habilitarlas en builds de producción.
- Stream de cámara y fotos **durante el stream**: stream.capturePhoto() funciona con un stream activo y retorna PhotoData.Bitmap o PhotoData.HEIC. La fotografía independiente camera.photo de alta calidad es una capacidad EXPERIMENTAL diferente.
- Inicialización correcta de Android: Wearables.initialize, registrar y pedir permiso explícito, createSession, observar DeviceSessionState.STARTED, entonces addCamera; iniciar el stream tras suscribir video/state/error. session.start() devuelve Unit y NO implica sesión lista.
- MockDeviceKit: permite pairing, simulación de permisos y feed, sin gafas reales. Wivra incorpora una prueba de instrumentación compilable usando mwdat-mockdevice solo como androidTestImplementation.

## Afirmaciones del informe que NO deben convertirse en hechos generales
- Las regresiones HFP / A2DP en Android son reportes concretos de usuarios y versiones, no una prohibición universal. Diagnosticar por dispositivo, firmware, versión del SO y Meta AI. https://github.com/facebook/meta-wearables-dat-android/discussions/82
- NO recomendar bloquear ni rebajar versiones de Meta AI al usuario: riesgo de seguridad y compatibilidad.
- «Stream y Photo no simultáneos» solo aplica a la capacidad Photo HQ independiente, NO a stream.capturePhoto.
- El informe mezcla mínimos del SDK, mínimos de apps de ejemplo y minSdk=31 de Wivra. Verificar matriz oficial antes de afirmar mínimos de Android/iOS.
- Speech/HFP/PCM son rutas de audio diferentes: speech entrega texto; PCM experimental registra ambiente y HFP ofrece entrada micrófono BT; no prometer rutas simultáneas sin QA.
- No se ha demostrado video, fotografía, audio, exportación o streaming LIVE en gafas reales por esta investigación documental. Tampoco que el audio de grabaciones internas de gafas esté disponible para descargar mediante SDK.
- La producción/distribución requiere revisar términos actuales, país, firmware, permisos y registro Meta. Los canales de testers no garantizan publicación en las tiendas.

## Código de ejemplo: advertencia
El pseudocódigo recibido en el informe añade cámara inmediatamente después de session.start(). Eso puede fallar con SESSION_IDLE. El código de Wivra en PR #77 sí espera a DeviceSessionState.STARTED. Meta confirma esa precondición en https://github.com/facebook/meta-wearables-dat-android/blob/main/AGENTS.md .

## Plan de integración con paridad iOS/Android
1. Mantener un único editor JavaScript de Claude en ambas apps. Swift/SwiftUI para iOS, Java/Kotlin para capa Android. No reescritura gratuita.
2. Test Android con MockDeviceKit de pairing, permisos y feed. Compilar androidTest APK en CI; ejecutar en emulador/dispositivo en una fase posterior. Compilar NO es ejecutar.
3. Convertir recepción de cuadros en preview visual real; medir FPS, latencia y cortes con Meta y teléfono.
4. Foto dentro del stream por la API estable en ambos sistemas. Foto independiente HQ solo tras que Meta autorice publicación.
5. Audio: primero fallback de micrófono teléfono o hardware externo elegido; luego evaluar HFP/PCM experimental bajo flags. No duplicar audio en MOV + pistas independientes.
6. Guardar/importar/exportar medios MOV/CAF/JPEG en un mismo proyecto; luego Director, voz, AutoCut, LIVE y pruebas end-to-end.
7. Mantener privacidad, conexión por acción del usuario, auditoría de funciones experimentales y cero APIs con facturación.

## Referencias
- https://github.com/facebook/meta-wearables-dat-android/blob/main/CHANGELOG.md
- https://github.com/facebook/meta-wearables-dat-android/blob/main/AGENTS.md
- https://github.com/facebook/meta-wearables-dat-android/tree/main/samples/CameraAccess
- https://github.com/facebook/meta-wearables-dat-ios/tree/main/samples/CameraAccess
- https://developers.meta.com/wearables/faq/
- https://wearables.developer.meta.com/docs/develop/dat/
