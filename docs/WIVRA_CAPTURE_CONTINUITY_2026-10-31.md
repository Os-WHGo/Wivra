# Wivra: continuidad nativa de captura

Rama `chatgpt/wivra-capture-continuity-20261031`, PR #134 hacia #133.
Base validada `3b49f1e`; commits Claude hasta `23c00fe` preservados mediante merge en esta rama, sin modificar sus referencias ni main.

## Cambios funcionales

- Verificación nativa de archivos privados: Android recorre los payloads de las pistas y decodifica extremos; iOS usa AVAssetReader y AVAssetImageGenerator. Se exige contenido real, duración positiva, ámbito de directorio, ausencia de symlinks y estabilidad del archivo durante lectura. Los extremos decodificados no certifican cada fotograma ni sincronía A/V.
- Ray-Ban Android verifica antes de publicar. Guardar una toma agrupada iOS verifica todos sus MOV/CAF antes de retirar el ticket. Un fragmento ausente o corrupto conserva ticket y originales; el usuario puede reintentar tras resolverlo.
- Copias Android MP4/WAV: escritura con fsync y relectura SHA-256 antes de visibilidad y eliminación del original. La reserva y publicación de dos filas MediaStore siguen sin ser una transacción de sistema.
- Recibo de publicación Ray-Ban persistido atómicamente antes de hacer visible la copia. Un reintento reutiliza solo una fila propia con carpeta/tipo y bytes idénticos; protege del duplicado por cierre entre copia y limpieza del original.
- Director persiste el inicio de guardado multipartes antes de publicar el primer fragmento. Tras interrupción, completar el subconjunto restante no permite emitir un nuevo recibo de toma completa. Los medios pueden seguir guardándose e importándose manualmente.
- Journal JS: nombres base seguros, validación de envolvente/estado/tiempos, bloqueo compartido por escritor dentro de un mismo contexto JS y rechazo de snapshots antiguos. No equivale a CAS entre procesos.
- Archivo local LIVE Android: revisión y guardado fuera del hilo UI; no inicia otra emisión durante esas operaciones. Se mantiene consentimiento explícito y la grabación local independiente de una caída de red.

## Pruebas y hallazgos

- Regresiones Node para rutas externas, snapshots antiguos, dos coordinadores y contratos nativos.
- Kotlin JVM: SHA-256 conocido, truncamiento y corrupción de igual tamaño.
- Instrumentación: muestra MP4 H.264/AAC real sintética, decodificación, truncamiento, symlink, MediaStore/readback, recibo persistido y guardado multipartes. No gafas físicas.
- Smoke macOS: muestras y extremos AVFoundation; toma con un MOV corrupto rechazada sin pérdida, seguida de reintento válido. Los marcadores AVAssetReader con cero muestras se ignoran como marcadores, nunca como contenido válido.
- CI final, hashes y cantidades definitivas se registran en el PR al concluir. No heredar el resultado de un SHA anterior.

## Paridad y límites todavía abiertos

| Área | Estado y siguiente trabajo |
| --- | --- |
| Verificación de captura | Nativa en ambas plataformas; falta hardware HEVC real, recorridos largos y deriva A/V |
| Coordinador JS `createNativeCaptureSession` | `verifyFile` conectado al puente nativo Android/iOS, restringido a nombres de checkpoint de la sesión 32-hex. El editor empaqueta el coordinador y su adaptador. Start/stop y journal nativo completos siguen pendientes; las UI nativas conservan sus propios flujos. Instrumentación con HEVC sintético distingue las llamadas de cámara simuladas de la verificación nativa real |
| Director Android | Captura y recibo tras Guardar; asociación real de assets ocurre mediante el importador existente. Persistencia del recibo parcial protegida; QA física pendiente |
| Director iOS | Biblioteca/selector de capturas existentes; selección de toma y lanzamiento de cámara desde el editor aún pendientes |
| Pantalla bloqueada | Android tiene servicio DAT y lease CPU; iOS ruta experimental y límites del SO. Sin verificación física en esta ejecución |
| Audio | Pistas WAV/CAF y procedencia existentes; Bluetooth/USB/Ray-Ban requieren hardware y permisos reales |
| LIVE | Android teléfono RTMP/RTMPS implementado; archivo local endurecido. Emisión real, reconexión, Ray-Ban y ruta iOS siguen pendientes/condicionadas; ninguna emisión activada |
| Paquetes | APK debug y compilaciones iOS en CI. Firma iOS pendiente; no contratar cuentas ni publicar |
| Exportación | Nuevos avances de Claude integrados sin sustituir motor; pruebas largas y rendimiento continúan siendo su área |

No hay nueva dependencia de producción, modelo, motor, permiso de captura ni servicio de pago. Se reutilizan APIs del sistema, SHA-256 del JDK y AndroidX ya presente. Referencias técnicas: [MediaExtractor](https://developer.android.com/reference/android/media/MediaExtractor), [MediaMetadataRetriever](https://developer.android.com/reference/android/media/MediaMetadataRetriever), [AVAssetReader](https://developer.apple.com/documentation/avfoundation/avassetreader), [AVAssetImageGenerator](https://developer.apple.com/documentation/avfoundation/avassetimagegenerator). Mantener metadatos sin validación se descartó por no demostrar bytes reproducibles; instalar un motor externo de decodificación no aporta ventaja para esta comprobación de plataforma.

## Reanudación

1. Consultar HEAD y resultados actuales de #134; corregir cualquier fallo nativo antes de otra integración.
2. Ejecutar la matriz física existente con Android/iPhone y gafas; conservar los originales ante cualquier fallo.
3. Conectar el host nativo de captura al coordinador y cerrar Director iOS, con identidad de proyecto/toma y consentimiento.
4. Completar reconexión LIVE mediante pruebas locales y estudiar la ruta iOS con APIs oficiales y cero gastos.

— ChatGPT
