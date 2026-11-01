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
