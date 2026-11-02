# Wivra · beta P0 · puerta de validación en dispositivos (2026-11-01)

**Estado:** protocolo preparado, **NO prueba física realizada**. No utilizar CI, vistas previas, LED, contador de frames o archivo de tamaño positivo como sustitutos de MP4 reproducible. Objetivo de beta: 2026-11-19. PR de trabajo: #138 sobre base #136; sin merge automático.

## Paquetes reproducibles

- Android: obtener el artefacto `Wivra-BETA-Android-DEBUG-apk` del workflow **Wivra Complete Beta Assembly (Mobile)** y verificar SHA256 con `Wivra-BETA-Android-SHA256` de la **misma ejecución y commit**. APK debug solo para pruebas, no publicación.
- iOS: `Wivra-BETA-iOS-UNSIGNED-ipa` es paquete arm64 **sin firma**. No afirmar que es instalable hasta firmar con credenciales autorizadas; comprobar identificador Meta DAT, Team ID, provisioning, entitlements y permiso de Fotos en la versión firmada. No pagar/contratar/publicar sin permiso.
- Correlacionar siempre SHA del HEAD, run, dispositivo, versión iOS/Android, firmware de gafas y hash de artefacto. No confundir artefactos antiguos con el commit actual.

## Matriz de aceptación (evidencia que debe aportar una prueba real)

| Puerta | Pasos y evidencia mínima | Criterio |
|---|---|---|
| P0-A. Captura iPhone | Conectar Ray-Ban Gen 2, registrar DAT, recibir fotogramas, capturar video, detener, confirmar **Keep**, abrir el MOV desde Archivos/AVPlayer. | Video reproducible, duración/frames plausibles, archivo local conservado. |
| P0-B. Señal caducada iOS | Durante preview interrumpir entrada de fotogramas >4 s sin detener sesión. Comprobar indicadores y botón de iniciar; volver a conectar; repetir con REC en curso. | Inicio/foto se deshabilitan sin muestras frescas; **Detener** sigue disponible durante REC. No asumir que frame recibido equivale a archivo final. |
| P0-C. Fotos iPhone (un MOV) | Confirmar Keep de una captura de **un solo archivo**. Pulsar **Guardar video en Fotos**. Aceptar permiso add-only; abrir Fotos y reproducir con audio si fue combinado. Repetir denegando permiso y con MP4/MOV inválido. | Copia solo tras confirmación y video válido; original Wivra conservado; fallo visible sin borrado. |\n| P0-C2. Fotos iPhone (captura segmentada) | Grabar >30 s sin audio para generar varios MOV y confirmar Keep; comprobar aviso con N partes y acción **Compartir solo el primer segmento**; verificar que NO se ofrece **Guardar video en Fotos** como si fuera la toma entera. Terminar sesión, abrir **Mis capturas** y comprobar que cada parte aparece para compartir o guardar individualmente. Unir en Director y exportar si se requiere un único video. | Ningún segmento aislado se presenta como grabación completa; el original completo permanece disponible por partes, sin borrados. **La unión/exportación móvil prolongada sigue pendiente de prueba física.** |
| P0-D. Audio y mux iPhone | Probar sin audio y con micrófono seleccionado disponible; cambiar ruta durante toma. Comparar CAF independiente, MOV original y MOV combinado; comprobar desfase con aplauso. | No sustituir/reclamar audio de gafas sin prueba; no borrar originales; reportar sincronía medida. |
| P0-E. Bolsillo y bloqueo | Probar pantalla bloqueada con opt-in experimental, medir interrupciones reales de tiempo/frames/video final; repetir sin opt-in. | Marcar **experimental** hasta repetición en hardware. No prometer continuidad garantizada en iOS/Meta DAT. |
| P0-F. Android y fotos | Instalar APK debug autenticado, detectar conexión real, probar timeout de frame, capturar y recuperar, verificar MediaStore y editor sin red. | Emulador y dispositivo físico diferenciados. No inferir soporte de futuras gafas. |
| P0-G. LIVE Android | Usar servidor de prueba privado con RTMPS, consentimiento visible y micrófono opcional; cortar la red y comprobar MP4 local. | Transmisión real y archivo local verificables, sin persistir clave de stream. |
| P0-H. Exportación y montaje largo | Importar 81 segmentos en tres tandas; exportar 10/20/30/60 min con dispositivo monitorizado; comparar duración, tamaño, reproducibilidad, sincronía, temperatura y RAM. | Resultados de Chromium/Linux **no** sustituyen una exportación móvil de 60 min. |
| P1-futuro. Gen 3 / Display / gestos | Identificar capacidades expuestas por SDK/firmware y permisos reales, sin inferir por nombre de producto. | Solo anunciar capacidades físicamente verificadas; P1 no bloquea Gen 2. |

## Registro de una ejecución real

- Fecha, ejecutor, dispositivo, SO y firmware:
- Commit + workflow run + SHA256 paquete:
- Identificador de sesión y permisos otorgados:
- Fuente de cámara y micrófono:
- Duración solicitada vs real, contador de muestras vs muestras escritas:
- Evidencia de contenedor reproducible, capturas locales y Fotos:
- Eventos de pantalla bloqueada, pérdidas de enlace y recuperación:
- Resultado **PASS/FAIL/BLOCKED** por puerta y enlace al reporte/issue:
- Regresiones respecto del build anterior:

## Reglas de seguridad

- Mantener originales, archivos pendientes y audio CAF al fallar fotos, mux, exportación o red.
- No capturar sin permiso ni iniciar LIVE público sin confirmación explícita.
- No introducir dependencias que rompan compilaciones de la beta para experimentos Gen 3/Display.
- Evitar publicar o fusionar hasta autorización y matriz P0 revisada.


## Instalación de desarrollo en el iPhone del propietario sin publicar en App Store

**Ruta posible sin pagar una membresía Apple:** Apple permite firmar y ejecutar apps personales desde **Xcode con un Apple Account / Personal Team**. El perfil gratuito dura **7 días** y necesita reinstalación periódica; no permite distribución App Store ni TestFlight. La disponibilidad de capacidades Meta DAT/entitlements y la coincidencia TeamID se comprueban en la instalación real, **no están garantizadas** por compilar sin firma. Fuente oficial: https://developer.apple.com/help/account/basics/about-your-developer-account y https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices .

1. Requisitos: un **Mac** con Xcode apropiado para el SDK Meta 1.0.1, Node.js 22, XcodeGen, un iPhone físico y Ray-Ban Meta ya enlazadas mediante Meta AI. No introducir contraseñas o certificados en GitHub ni en el chat.
2. Usar la **rama de beta probada** indicada en la PR #138, nunca un viejo prototipo B0: `git clone https://github.com/Os-WHGo/Wivra.git`, `cd Wivra`, `git fetch origin`, `git switch chatgpt/wivra-dat-capability-probe-20261101`, `node app/build.mjs`, `cd streaming/ios/B0`, `xcodegen generate`, `open WivraMetaB0.xcodeproj`.
3. En Xcode > Settings > Apple Accounts, iniciar sesión con la cuenta del propietario. En el target `WivraMetaB0`, Signing & Capabilities, usar **Automatically manage signing**, elegir Personal Team o equipo de desarrollador autorizado y seleccionar el iPhone conectado. Si Xcode solicita registrar el dispositivo, hacerlo desde Xcode.
4. Para la **primera prueba personal en Developer Mode**, el SDK Meta DAT admite `MetaAppID` vacío, `0` o el placeholder sin expandir y omite la atestación de producción. No hace falta pedir todavía `META_APP_ID` ni `CLIENT_TOKEN` de un canal de publicación. Sí necesitas Meta AI instalada, gafas con Developer Mode activo, Internet para el registro, permisos de cámara y el equipo Apple de firma correcto. Para **producción u otros canales**, configurar `META_APP_ID`, `CLIENT_TOKEN` y `TeamID` reales en ajustes locales de Xcode, nunca en commits públicos. Mantener esta distinción bajo verificación con la versión 1.0.1 realmente integrada: una compilación o un valor `0` no prueba que las gafas estén conectadas.
5. Mantener las declaraciones `Info.plist` de cámara, micrófono, Bluetooth y `NSPhotoLibraryAddUsageDescription`, y el esquema de devolución `wivrametab0://`. Habilitar Developer Mode del iPhone si Xcode lo solicita; activar Developer Mode de las gafas en Meta AI cuando esté disponible y autorizado.
6. **Build & Run** desde Xcode sobre el dispositivo físico. Registrar fecha, versión de iOS, firmware, permisos, commit y resultados de las puertas P0-A a P0-E. En el primer ensayo usar vista previa/captura en **primer plano**. Pantalla bloqueada permanece experimental.
7. Si no hay Mac o no resulta compatible la firma Personal Team con Meta DAT, detener la instalación y registrar el bloqueo. La IPA CI **UNSIGNED** no se instala directamente en un iPhone. No comprar membresía ni publicar hasta autorización expresa.

**Limitación importante:** esta ruta es una guía verificada contra documentación Apple, no una instalación ya ejecutada ni una garantía de acceso Meta. Para distribuir a terceros por TestFlight/App Store se necesita el programa adecuado; eso queda fuera de esta beta de prueba individual.

Fuente oficial Meta sobre Developer Mode versus Production y ausencia de credenciales en modo desarrollador: https://github.com/facebook/meta-wearables-dat-ios/blob/main/plugins/mwdat-ios/skills/getting-started/SKILL.md . Meta CameraAccess sample: https://github.com/facebook/meta-wearables-dat-ios/blob/main/samples/CameraAccess/README.md .


## Alternativa experimental si solo hay PC Windows (sin pagar por publicar)

**No sustituye la firma Apple y NO está validada con la beta Wivra ni con Meta DAT.** El IPA de GitHub Actions es **UNSIGNED**; una herramienta de confianza debe firmarlo con el perfil de desarrollo del propietario. Nunca enviar Apple ID, contraseñas, 2FA, pairing files ni perfiles a ChatGPT, issues, repositorios o servicios de firma desconocidos.

| Método | Requisitos y evaluación | Decisión |
|---|---|---|
| **Xcode + Personal Team** | Mac + Xcode + Apple Account gratuito; herramienta oficial, depuración y firma más transparente | **Primera opción si hay Mac** |
| **AltStore Classic / AltServer** | PC Windows 10+ o Mac; instalación desde sitio oficial, iTunes/iCloud de Apple; permite cargar un IPA propio y renovar firmas de 7 días. Límite 3 apps activas / hasta 10 App IDs bajo cuenta gratuita | **Candidato Windows P0**, verificar primero Meta callback, permisos y firma |
| SideStore | Proyecto comunitario basado en AltStore; requiere preparación inicial con computador y VPN/local pairing para renovar sin computadora | Alternativa futura, más compleja, no necesaria para primer test |
| Sideloadly | Windows/Mac y Apple Account; firma gratuita 7 días. Herramienta de terceros, evaluar privacidad y confianza antes de introducir credenciales | No se requiere para P0, documentado para comparación |

Procedimiento Windows que **puede intentarse**, una vez que CI del commit exacto sea verde:
1. Descargar `Wivra-BETA-iOS-UNSIGNED-ipa` del mismo run de `Wivra Complete Beta Assembly (Mobile)`, verificar su SHA256 y conservar el paquete original intacto.
2. Instalar **AltServer/AltStore Classic** únicamente desde https://altstore.io/ y seguir su guía Windows: https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows . No utilizar AltStore PAL, ya que la disponibilidad de ese marketplace depende de regiones.
3. Conectar el iPhone al computador, confiar en el dispositivo, habilitar **Developer Mode** de iOS si se solicita y firmar/sideloadear **solo el IPA propio** mediante AltStore Classic o `Sideload .ipa…` de AltServer cuando la versión lo incluya. La cuenta Apple se gestiona localmente en la herramienta instalada, nunca en repositorio ni chat.
4. Verificar si la app realmente **abre**, el identificador firmado y `wivrametab0://` se conservan, Meta AI puede devolver el registro, DAT detecta gafas Gen 2 y la app solicita permisos; si la firma altera Team ID, callback o capacidades, registrar **BLOCKED**, no asumir compatibilidad.
5. Aplicar la matriz P0. Mantener archivos originales de captura y hacer copia de seguridad antes de reinstalar. Los perfiles gratuitos caducan a los **7 días**, por lo que habrá que renovarlos sin borrar datos; respetar los límites de tres apps activas y diez App IDs.

Referencias oficiales de terceros: https://faq.altstore.io/altstore-classic/altserver ; https://faq.altstore.io/altstore-classic/app-ids ; https://docs.sidestore.io/docs/installation/install ; https://sideloadly.io/faq . Referencia Apple Personal Team: https://developer.apple.com/help/account/basics/about-your-developer-account .

**Estado de prueba:** solo investigación documental comparativa, sin instalación de AltStore ni firma de Wivra. Ninguna de estas herramientas se añade como dependencia del producto; no implica gastos ni publicación.


## P0-I · Protección de almacenamiento y privacidad iOS (PR #140)

**Código implementado, ensayo físico NO realizado.** La protección usa espacio para uso importante del volumen local de Documentos, no capacidad total anunciada ni volumen USB. Márgenes iniciales: 512 MiB para empezar, 256 MiB para cerrar; estos valores no garantizan exportación, Fotos, audio adicional ni grabación con pantalla bloqueada.

1. **Preflight sin destruir toma anterior**: ante menos de 512 MiB disponibles, pulsar REC; debe mostrar aviso, NO abrir otro escritor CAF/MOV y dejar visible la última toma ya finalizada. Nunca probar llevando el iPhone real a 0 bytes; preferir instrumento/volumen de prueba controlado.
2. **Duración orientativa**: con DAT .hvc1 en movimiento, observar `measuredCompressedMbps` junto al diagnóstico local. Al inicio o si no se conocen bytes/bitrate, mostrar que no hay estimación. Cambiar ritmo de movimiento y comprobar que los minutos cambian; no confundir con bitrate RTMP.
3. **Cierre por reserva crítica**: tras una grabación iniciada normalmente, simular espacio inferior a 256 MiB o disponer de entorno de prueba acotado; comprobar aviso y cierre por el finalizador nativo, partes reproducibles, protección `Keep/Later/Discard`, jamás borrado silencioso. El watchdog se consulta cada 10 s cuando iOS ejecuta la app; no garantiza que continúe tras suspensión por pantalla bloqueada.
4. **Exportación y Fotos**: comprobar que mostrar minutos estimados no permite afirmar que quepa la unión, MP4 final, copia en Fotos o backup USB. Si falla el espacio, preservar partes y reintentar solo tras liberar o elegir destino compatible.
5. **Privacidad**: verificar que el bundle firmado contiene `PrivacyInfo.xcprivacy` con razones de espacio `85F4.1` (mostrar) y `E174.1` (bloqueo seguro), y que ninguna métrica del volumen se envía a servidores externos. Probar con los ocho idiomas y el aviso de cierre automático.
6. **Regresión con hardware**: repetir con Ray-Ban Gen 2, micrófono seleccionado y sin audio; pérdida de conexión DAT mientras el watchdog consulta espacio, terminación voluntaria y cambio de cámara; no atribuir PASS físico a compilación CI.

Referencias: https://developer.apple.com/documentation/foundation/checking-volume-storage-capacity ; https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype .


## P0-J · una toma Meta -> un MOV completo local tras conservar (PR #141)

**Implementado en código, NO validado con Ray-Ban reales.** Esta ruta es solo para partes de video HEVC sin audio. No sustituye la prueba de 60 minutos ni promete que el archivo combinado pueda publicarse en Fotos sin espacio adicional.

1. **Consentimiento**: generar 2 o más partes `Wivra_Meta_<sesión>_partNNNN.mov`; detener; elegir **Más tarde**, cerrar/reabrir y comprobar que no se une ni se añade nada a Fotos. Reabrir y elegir **Conservar**. Solo entonces debe comenzar la unión. Confirmar ausencia de destrucción y publicación mientras esté pendiente.
2. **Archivo unificado**: tras Keep, comprobar `_complete.mov` en la carpeta privada de Wivra, reproducirlo desde principio a fin, comparar duración con suma de partes (tolerancia de 2 s o 2 %) y comprobar orientación y fotogramas en las uniones. Verificar que cada parte original y su manifiesto permanece disponible. Revisar catálogo después de reiniciar.
3. **Fotos**: nunca ofrecer solo la primera parte como si fuera la película completa. Cuando el MOV unido esté verificado, permitir **Guardar video completo en Fotos** por acción explícita; reproducir el único video copiado con Photos. Google Fotos depende de copia de seguridad de su propia app, no de Wivra.
4. **Espacio y formatos**: repetir sin espacio adicional suficiente, con parte faltante/corrupta/symlink, orden roto, dimensión DAT cambiada durante la toma y un `_complete.mov` previo. No sustituir archivos previos, no declarar completado un MP4 vacío/truncado, mantener todos los MOV originales y ofrecer reintento después de liberar espacio. No saturar el dispositivo físico hasta cero bytes.
5. **Interrupciones**: forzar cierre de la app durante la unión y al bloquear el iPhone. Comprobar recuperación de partes originales; reconocer que el proceso de unión no tiene todavía reanudación automática si iOS suspende/mata la app. No inferir grabación exitosa de un estado REC ni exportación exitosa de un archivo no inspeccionado.
6. **Rendimiento P0**: probar 5, 15, 30 y 60 minutos reales con memoria, energía, temperatura, disco inicial/final, tiempo de unión y reproducción desde Archivos/Fotos. Comparar HEVC de baja/alta resolución; cuando los parámetros de los segmentos son incompatibles, bloquear unión en vez de producir video corrupto. Con entrada de audio CAF independiente el camino de unión debe tratarse en una fase separada de sincronía real.

**Criterio de aprobación:** todos los MOV confirmados y reproducibles se reflejan en una única película completa **solo tras Keep**, conservando originales, sin duplicar segmentos en galería. En cualquier fallo, mantener partes y advertir. Una compilación de CI sin gafas NO satisface este criterio.


## P0-K · Política estricta de galería: una película por toma (PR #143)

**Cambio en el catálogo nativo, no en grabación o codec.** Los archivos internos `_part0001.mov`, `_part0002.mov`, etc. permanecen guardados y recuperables dentro de Wivra, pero no se ofrecen como videos independientes mediante `Guardar en Fotos` cuando existen varios en la misma toma.

Pruebas físicas pendientes:

1. **Un archivo corto:** grabar pocos segundos que finalicen en un único `_part0001.mov`. Confirmar Keep y comprobar que Mis capturas sí permite guardar ese video completo en Fotos.
2. **Varios segmentos:** grabar más de una rotación y confirmar Keep. Antes y después de unir, las filas `_partNNNN.mov` no deben ofrecer botón `Guardar en Fotos`. Si la unión falla, conservar todos los originales y ofrecer `Reintentar unión`, sin llenar la galería.
3. **Película completa:** tras generar y validar `_complete.mov`, su fila debe ofrecer `Guardar en Fotos`; guardar una vez por acción explícita y comprobar en la app Fotos que corresponde al lapso completo y no a un fragmento inicial.
4. **Reinicio:** forzar cierre y reabrir con manifiestos verificados; repetir los tres casos. Una toma pendiente de Keep no debe aparecer ni publicarse.
5. **Compartir fragmento:** Wivra puede permitirlo explícitamente para recuperar material, con etiqueta `Compartir solo este fragmento`. No confundir el Share Sheet de iOS con una publicación automática en Fotos.
6. **Error/fallback:** permisos de Fotos denegados, sin espacio y MOV completo corrupto deben producir error legible, conservar originales y no fingir una copia correcta. Google Fotos solo sincroniza cuando el usuario activa el backup en esa app.

Resultado de CI y QA físico deben anotarse por SHA. Ninguna prueba automatizada acredita la calidad de la película de 30/60 min o que Google Fotos ya realizó el respaldo.


## P0-L · Sello de finalización y recuento real por toma (PR #144)

**Estado: código y pruebas de contrato implementados, hardware sin probar.** El recibo privado `Wivra_Meta_<session>_take.wivra.take.json` registra `expectedParts`, `savedFiles` y `fullyFinalized` tras completar los trabajos AVAssetWriter.

1. **Cierre normal con un fragmento**: finalizar 10–20 s después de obtener fotogramas y confirmar que hay un recibo de 1 parte completo; Keep y Guardar en Fotos deben quedar disponibles únicamente tras verificación.
2. **Cierre con varias partes**: 5/15/30/60 min, cada MOV debe coincidir con el recuento y su nombre ordenado; luego Keep, unión passthrough y UNA película final validada. Los originales no aparecen automáticamente en Fotos.
3. **Interrupción a mitad de rotación**: simular fallo de `WivraHEVCRecorder.arm()` para la parte 2, un `.noFrames`, archivo MOV corrupto o error al finalizar; la parte 1 permanece privada/revisable, pero la toma NO debe ofrecerse como video completo ni permitir autounión.
4. **App terminada antes del recibo**: puede recuperar MOV finalizados para revisión y Keep; sin recibo válido, permanece en estado INDETERMINADO, no en estado completo. No inventar segundos, cuadros ni archivos.
5. **Prueba de integridad negativa**: eliminar `_part0002.mov`, modificar el JSON, convertirlo en symlink, duplicar nombre de parte o cambiar su `fullyFinalized`. No debe quedar permitido el guardado en Fotos ni el reintento de unión.
6. **Consistencia de consentimiento**: Keep/Later/Discard controla MOV y recibo juntos. Descartar requiere la confirmación destructiva vigente; sin esa confirmación nunca eliminar.
7. **Regresión legada**: las capturas previas sin recibo no son automáticamente completas; los originales recuperables pueden compartirse manualmente. Documentar límite de compatibilidad, no afirmar reparación automática de tomas que carecen de prueba de finalización.

Este sello demuestra la finalización de los escritores conocidos, **no** que el SDK Meta entregó todos los fotogramas, ni garantiza duración de grabación con pantalla bloqueada.

## P0-M · LIVE Android con respaldo MP4 opcional y seguridad de VOD (PR #145)

**Estado: código Android FULL implementado y pendiente de QA física RTMP.**

1. **Solo LIVE**: desactivar `Guardar también una copia MP4 local`, confirmar emisión; comprobar que se inicia `startStream` sin `startRecord`, no se crea MP4 local y al detener informa explícitamente que no existe copia. La plataforma puede NO conservar VOD.
2. **LIVE y copia**: activar opción; con memoria libre comprobar que el MP4 se crea de forma privada, que al detener se cierra el muxer y que Guardar a Galería requiere video verificado y decisión explícita.
3. **Disco lleno antes de LIVE**: con menos de 128 MiB libres, LIVE+MP4 no inicia; solo LIVE puede intentar conectarse, sin falsas garantías del servidor.
4. **Disco crítico mientras LIVE continúa**: simular consumo hasta umbral con copia activa; comprobar que se solicita `stopRecord` y NO `stopStream` si RootEncoder lo permite, el MP4 pendiente permanece privado para revisión y la emisión RTMP sigue conectada. Si RootEncoder no admite separar el cierre y `isRecording` sigue activo, debe finalizar LIVE para no llenar el teléfono.
5. **VOD externo**: verificar manualmente los ajustes de archivado del proveedor. Wivra no verifica YouTube/Twitch/Kick/TikTok ni promete retención o subida si no hay integración oficial autorizada. No publicar por accidente ni exponer claves RTMP en estados, logs o preferencias.
6. **Pérdida de Internet**: al caer RTMP con copia local activa, el MP4 puede mantenerse para recuperación; con copia desactivada no inventar ningún MP4. Confirmar estado del callback de conexión realmente reportado.
7. **Privacidad y ciclo de vida**: permiso micrófono opcional, `FLAG_SECURE`, confirmar emisión pública, emisión se detiene al salir de pantalla conforme a la implementación actual. Comprobar batería/temperatura y reproducibilidad del MP4.

**No se presupone** LIVE en Ray-Ban, multicámara en directo ni LIVE iOS por disponer de LIVE Android con cámara del teléfono. El emulador/CI no prueban un destino RTMP externo.


## P0-N · Fuente frontal/trasera de LIVE Android (PR #148)

**Construido sobre RootEncoder 2.8.1 existente.** Es una sola cámara seleccionable, NO multicámara simultánea.

- Antes de iniciar LIVE con cámara: pulsar Cambiar cámara y comprobar vista previa frontal y trasera, resolución disponible y permisos.
- Durante emisión RTMP privada: cambiar entre ambas cámaras sin volver a autorizar publicación; confirmar imagen y sincronía en el servidor, no solo en vista previa.
- Si el segundo sensor no soporta la resolución H.264 elegida, mostrar fallo sin inventar fotogramas REC; comprobar grabación MP4 opcional y archivo final.
- Repetir con micrófono activado/desactivado y copia local activada/desactivada; no activar micrófono sin consentimiento.

## P1-S · Pantalla completa / una aplicación como fuente LIVE Android (PR #149)

**Implementación progresiva de VIDEO de pantalla únicamente**, con permiso de `MediaProjection` por sesión, FGS visible y RTMP directo. En esta variante no se captura audio del teléfono o de otras apps y NO se crea MP4 local. No inferir capacidad DRM ni entrevistar desde otra app con audio.

- Pulsar LIVE · pantalla o aplicación. Comprobar `FLAG_SECURE` de la clave RTMP y la confirmación de emisión pública antes del selector del sistema.
- Elegir pantalla completa o app compatible desde el selector nativo Android. Rechazar consentimiento no debe emitir ningún frame ni abrir RTMP. Mostrar notificación de pantalla compartida y Detener.
- Una vez iniciado un destino RTMP privado, abandonar la Activity para mostrar otra app. Comprobar que el servicio `mediaProjection` mantiene video y notificación hasta la orden Detener. La continuidad real y FPS solo se aprueban con Android físico y reproducción remota.
- Revocar MediaProjection desde el sistema: stream debe cerrarse y **pedir consentimiento NUEVO** para retomarlo, sin reutilizar token en Android 14+.
- Probar app con `FLAG_SECURE`, DRM y contenido protegido: zonas negras son una limitación normal, nunca intentar saltársela. El audio de terceros puede no estar permitido incluso si su video se ve.
- Revisar rotación, pantalla apagada, app dividida, conectividad, calor y consumo; no declarar compatibilidad universal por compilar Android SDK 35.
- Verificar sin clave en logs/Intent extras/estado guardado/notificación, y que la variante Wivra Capture no incluya ni servicio ni permiso `FOREGROUND_SERVICE_MEDIA_PROJECTION`.
- Confirmar ajustes VOD del proveedor antes de emitir: esta ruta **no tiene MP4 local ni comprobación de VOD remoto**. No confundir un evento «Conectando» con emisión aceptada por servidor.

Las pruebas GitHub Actions de API/Gradle/UI son software QA; la demostración de pantalla/proveedor sigue pendiente para el lote físico autorizado por el propietario.


## P0-O · Pérdida de fotogramas DAT durante grabación Gen 2 (PR #150, unificada #151)

**Estado: cierre y marcado parcial implementados y con contratos automáticos; no existe prueba física DAT prolongada aún.** La vista previa Meta DAT puede recibir estados `.paused` transitorios sin que haya terminado la sesión. El watchdog reutilizado consulta marcas de tiempo de fotogramas recibidos y solo cierra tras al menos 15 s sin cuadros.

- Iniciar captura HEVC con prueba de fotogramas reales. Pausar DAT menos de 15 s y reanudar; comprobar que **no** se descartan segmentos ni se reinicia la toma sin consentimiento.
- Simular ausencia de video por 15–25 s, forzar desconexión `.stopped` y `.thermalHot` en pruebas controladas. En cada escenario, comprobar cierre por finalizador existente y recibo de toma `fullyFinalized=false` en video sin audio. Todas las partes legibles quedan privadas y recuperables bajo Keep/Later/Discard.
- Revisar que el aviso «Se interrumpió la señal» aparezca en la interfaz y en los ocho idiomas, que la copia completa y Fotos queden bloqueadas para recibo parcial y que el usuario pueda conservar originales.
- Probar parada **voluntaria** del usuario: el grabador no debe marcar fallo de transporte cuando no lo hubo. Probar fallo de audio lateral y selección Bluetooth sin atribuir sincronía probada.
- Probar pantalla apagada/suspensión: un `Task.sleep` iOS no garantiza ejecución continua; al reabrir, no afirmar recuperación de fotogramas que nunca fueron recibidos.
- Comprobar cadencia y periodo de gracia según DAT/temperatura/movimiento deportivo con Ray-Ban Gen 2; el umbral 15 s es provisional y debe ajustarse si se pierden capturas válidas.

## P0-P · Gate de cámara real para LIVE Android (PR #151)

El modo LIVE cámara del teléfono necesita permiso actual de cámara, `SurfaceView` válido y `RootEncoder.isOnPreview`; `prepareVideo()` por sí solo no demuestra cámara utilizable.

- Preparar video, pero quitar permiso o destruir vista previa antes de confirmar emisión: el botón debe estar desactivado o la emisión rechazada sin `startRecord`, archivo privado ni RTMP.
- Tras aceptar el diálogo de emisión, revocar permiso de cámara o destruir superficie antes del callback de inicio: volver a validar capacidad inmediatamente antes de cualquier escritura o `startStream`.
- Restaurar la vista previa y permiso; permitir volver a intentar sin reiniciar la aplicación. Girar frontal/trasera y comprobar imagen, cuando el dispositivo lo soporte, sin declarar multicámara simultánea.
- Probar pantalla MediaProjection por separado: esta puerta es SOLO de cámara nativa y no debe bloquear el servicio independiente de pantalla autorizado por el usuario.
- Confirmar estado real del servidor RTMP y MP4 finalizado con dispositivo Android físico. Vista previa activa y callback de conexión no certifican VOD remoto.


## P0-P · Selector único de fuentes de cámara y LIVE Android (PR #153)

**Implementado como navegación real, no como compositor multicámara.** Se ejecutan los controles nativos existentes; el selector por sí mismo NO confirma permiso, fotogramas, emisión remota ni un MP4 válido.

1. **Wivra FULL:** desde la app unificada pulsar **Cámara · elegir fuente** y comprobar que aparecen Ray-Ban Meta (abre el diagnóstico/captura DAT) y teléfono (abre CameraX, frontal/trasera). Regresar al Editor/Director y comprobar que el mismo proyecto continúa sin recargarse.
2. **LIVE FULL:** pulsar **LIVE · elegir fuente**. La cámara de teléfono abre la actividad RootEncoder con micrófono y copia MP4 opcionales; «pantalla o aplicación» abre MediaProjection con consentimiento Android por sesión, FGS visible y STOP. No prometer que se capturó audio de otra aplicación ni soporte DRM.
3. **Wivra Capture:** el selector de cámara debe existir, pero no aparecerá botón LIVE. El paquete Capture no incorpora RootEncoder. Verificar con `captureDebug` y `fullDebug` para evitar referencias de clases inexistentes.
4. **Sin hardware de cámara:** la opción de teléfono debe explicar que Android no encuentra cámara sin lanzar una actividad que fallará. Ray-Ban Meta conserva su flujo autónomo de detección; abrir su pantalla no significa conexión satisfactoria.
5. **Lista Android:** abrir ambos selectores y comprobar que se ven todos los elementos (Android no muestra a la vez mensaje normal y lista de `AlertDialog`). La opción **Limitaciones** abre un diálogo informativo separado; no lanza funciones todavía inexistentes.
6. **Ocho idiomas:** alternar español, inglés, francés, portugués, alemán, italiano, japonés y chino; comprobar títulos, opciones, errores y limitaciones. No prometer traducción completa de mensajes antiguos de LIVE que todavía usan cadenas embebidas.
7. **Política de capacidades:** `meta-dat`, `phone-camera`, `screen`, `app-window` se corresponden con el registro `core/source-capabilities.mjs`. El selector abre la ruta autorizada pero nunca asigna READY sin evidencia real de sesión. PiP, dos fuentes simultáneas y audio interno de terceros permanecen expresamente fuera de esta ruta.
8. **Sin filtración:** elegir destino LIVE solo dentro de la actividad correspondiente, nunca desde el selector ni pasando clave RTMP por `Intent` o WebView. Probar cancelación en cada etapa sin emisión accidental.

**Criterio P0:** poder elegir las rutas de captura/LIVE básicas en Android con una interfaz compacta, compilación FULL/Capture sin regresiones, sin exponer opciones falsas ni permisos implícitos. La validación de transmisión y calidad física sigue pendiente.


### P0-Q · Exportación Android: inspección de duración tras publicar MediaStore (sin cámara física)

- Exportar en la app FULL un proyecto WebM real por el puente progresivo. Validar que el original queda privado mientras se escribe, CRC coincide, Cues y Duration están en el WebM reparado y el archivo visible sigue en Movies/Wivra.
- Medir en Android/emulador cuándo MediaMetadataRetriever devuelve vídeo y duración después de IS_PENDING=0. La exportación reparada reintenta máximo 4 inspecciones en hilo de IO (esperas 100/200/300 ms), nunca en UI; el bruto/sin reparar no añade esperas. El campo androidMediaInspection=available indica metadatos expuestos, no reproducción de 60 minutos real.
- Si las inspecciones fallan, el WebM verificado permanece recuperable y la respuesta indica androidMediaInspection=unverified sin fabricar media, duración o vídeo validado. El usuario puede recibir el archivo aunque el dispositivo no haya inspeccionado su contenido.
- Repetir en emulador, otros API y móvil real cuando se haga QA por lotes. Contrastar codecs no soportados y ausencia transitoria de MediaMetadataRetriever. Comprobar cero filas pendientes huérfanas.
- Fuentes oficiales: https://developer.android.com/reference/android/media/MediaMetadataRetriever ; https://developer.android.com/training/data-storage/shared/media . Sin nuevo SDK, coste ni permiso.


### P0-R · LIVE Android FULL: entrada de micrófono preferida, sin cambio silencioso (sin hardware QA)

1. Abrir LIVE > cámara de teléfono con cámara habilitada y sin iniciar una transmisión. Con micrófono desactivado, botón de selección audio deshabilitado y ninguna captura de audio activa. Tras habilitar audio, Android solicita `RECORD_AUDIO` solo al intentar comenzar LIVE. 
2. Abrir «Entrada de audio» y verificar que «Automática» aparece siempre; el resto se descubre con `AudioManager.getDevices(GET_DEVICES_INPUTS)` e `isSource`. Solo rotular teléfono, USB, auricular con cable, SCO/BLE cuando Android enumere una **entrada**, no por presencia de dispositivo emparejado. Identificadores efímeros, sin nombre privado ni dirección MAC, sin guardar datos o contraseñas.
3. Elegir una entrada USB/BT real (si existe), confirmar RTMP después de revisar la política VOD. Wivra revalida que el dispositivo seleccionado está presente **antes** de abrir un MP4 o iniciar RTMP. RootEncoder 2.8.1 crea su propia `MicrophoneSource`; después de `prepareAudio` aplica `setPreferredDevice` a ese mismo `AudioRecord`. Si la preferencia falla, no inicia transmisión. El audio desactivado sigue usando `NoAudioSource`.
4. Desconectar el micrófono elegido durante LIVE en **una transmisión de prueba consentida**. La callback de Android solicita `stopAndReview`, cierra RTMP/copia local siguiendo los gates MP4 ya existentes y muestra mensaje de entrada perdida. No sustituir silenciosamente el micrófono por otro. Un cambio de ruta del sistema sin desconexión puede no generar esta callback: seguir verificando sonido real, canal y sync.
5. Cambiar entre automático/USB/BT cuando no está emitiendo; probar permisos denegados, selección obsoleta, cambio de dispositivo entre diálogo y publicación, reinicio de actividad, y que no se filtren ID de entrada, MAC ni RTMP en logs/JS/preferencias. La elección no persiste tras reiniciar.
6. Verificar las ocho traducciones (ES/EN/FR/PT/DE/IT/JA/ZH); LIVE está exclusivamente en Android FULL, Wivra Capture mantiene su compilación sin RootEncoder. Test de contrato `streaming/tests/android-live-microphone-choice.test.mjs` y compilaciones Gradle; resultados lógicos **no** certifican que un micrófono BT sea usado físicamente.

**Alternativas comparadas:** `AudioManager.setCommunicationDevice` enruta principalmente llamadas/comunicación y no certifica el AudioRecord de RootEncoder; un segundo grabador de prueba puede competir por la entrada; usar `MicrophoneSource.setPreferredDevice` existente después de `prepareAudio` es el camino menos invasivo (Apache-2.0 ya en FULL). El API Android solo expresa una **preferencia**; el dispositivo realmente enrutado requiere inspección/muestras con hardware. Fuentes: https://github.com/pedroSG94/RootEncoder/blob/2.8.1/encoder/src/main/java/com/pedro/encoder/input/sources/audio/MicrophoneSource.kt ; https://developer.android.com/reference/android/media/AudioRouting ; https://developer.android.com/reference/android/media/AudioRecord .

### P0-S · iPhone LIVE RTMP endpoint gate (software, no network)

- UI must not publish anything merely because a URL is typed. Full RTMP/RTMPS input must include app path and stream key; reject HTTP(S), query/fragment, userinfo, whitespace/control chars and missing app/key. Keep raw key memory-only.
- Swift smoke compiles the same WivraIOSLiveEndpoint.swift used by the app on macOS CI. No request, RTMP handshake or credential in test. Reject malformed URLs before asking for camera/microphone permission. Test cases in streaming/tests/WivraIOSLiveEndpointSmoke.swift.
- Future iOS publisher requires separate public-confirmation gate, foreground-only camera ownership, OS permissions and explicit STOP. iPhone camera video only first; Meta DAT and screenshots are separate adapters, no false READY.
- Manual test of actual stream key, provider VOD, audio and network will happen in the owner-approved device QA batch. Do NOT store real keys in CI or send logs/screenshots containing them.


### P0-T · iPhone LIVE cámara nativa RTMP/RTMPS (pruebas físicas pospuestas)

- La ruta REAL **LIVE iPhone** es una hoja exclusiva accesible desde la aplicación unificada solo cuando Meta DAT y captura iPhone están completamente liberados; no es LIVE de las gafas ni una segunda cámara simultánea. El SDK HaishinKit v2.2.5 BSD-3 pinneado ofrece MediaMixer/RTMPConnection/RTMPStream, sin servidor intermedio Wivra. Restringir a iPhone cámara trasera en primer bloque.
- Introducir URL completa RTMP/RTMPS en campo protegido con servidor/app/clave. No se registra, guarda en preferencias ni pasa a Editor; se separa en memoria mediante WivraIOSLiveEndpoint. Cancela sin permiso o red. Verificar que se mantiene texto privado hasta confirmación y se borra al arrancar/parar.
- Pulsar «Preparar LIVE público» y aceptar confirmación explícita. Solo entonces solicitar cámara, y pedir micrófono únicamente cuando opt-in; rechazar permisos debe impedir RTMP. Mostrar estado de conexión/publicación solicitado, NO certificar ingest remoto solo porque publish retorna. Revisión remota/VOD queda pendiente.
- Pulsar STOP o mandar la app a background: cancelar sesión, cerrar RTMPStream/RTMPConnection, liberar MediaMixer, desactivar audio y borrar clave. En LIVE iOS P0-T **no hay MP4 local**; activar archivo VOD en plataforma para las pruebas. No prometer captura bloqueada o RTMP en segundo plano.
- Comparar Mac CI y simulador con hardware físico más adelante; no probar con claves reales en CI. En la tanda física, verificar video H.264, audio opt-in, desincronización, interrupción de red, recuento de frames, calentamiento, VOD, STOP y pérdida de permisos. Instalar solo cuando el propietario decida y tenga firma Apple.
- El SDK es BSD-3-Clause, sus dependencias transversales requieren inventario y políticas de distribución antes de publicar. Candidato alternativo LiveKit/WebRTC descartado para esta ruta simple por necesidad de servidor/signalling o relay; librería AVFoundation nativa no trae cliente RTMP. HaishinKit RTMP tiene SPM y código abierto, se somete a build Xcode para comprobar compatibilidad real.
