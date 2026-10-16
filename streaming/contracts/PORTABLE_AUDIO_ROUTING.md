# Wivra · audio LIVE / VOD limpio / originales (contrato portátil v1)

**Estado: diseño ejecutable y contratos Node, NO un mezclador de audio operativo.** El motor/editor único de Claude no se modifica. Las aplicaciones nativas iOS/Android actuales no tienen conectada todavía esta capa y ninguna plataforma recibe las pistas de este plan.

## Por qué existe

Una misma aplicación puede evolucionar desde **iOS y Android** hacia Windows, macOS y Linux. El núcleo de decisiones de enrutamiento se encuentra en `streaming/audio-routing.mjs`; no depende del SDK Meta, Xcode, Kotlin, APIs de desktop, OBS ni un proveedor LIVE. El anfitrión nativo debe implementar captura y mezcla física, con permisos propios del sistema.

```text
Móvil/Escritorio (adaptadores capturan fuentes realmente disponibles)
  Cámara: Meta DAT iOS/Android | iPhone/Android | webcam/capturadora escritorio
  Audio: micrófono | música reproducida desde fuente independiente |
         juego/sistema si captura autorizada | efectos
                            │
                     FUENTES AISLADAS
                            │
                 Wivra Audio Routing v1
                            ├── LIVE: voz + música + efectos (si usuario lo activa)
                            ├── VOD local candidato: voz + efectos, sin música aislada
                            └── ARCHIVO: fuentes originales por pistas para el editor
                            │
                            └── Twitch VOD Track opcional SOLO si un adaptador
                                Twitch real valida la ruta remota por separado
```

La matriz no realiza DSP, mix en tiempo real ni escritura de archivos. No implementa `getDisplayMedia`, capturas de audio protegidas, captura de audio del sistema, reproducción de canciones, un codificador AAC ni un publicador RTMP/RTMPS.

## Reglas de audio
- **Fuentes independientes**: cada identificador `src-*` corresponde a un PCM realmente abierto y autorizado; entradas no comprobadas se rechazan.
- **Tres mezclas**: `live` para la audiencia en directo; `vod` para una **copia local publicable después**; `archive` para conservar fuentes originales por separado. Música aislada entra por defecto en LIVE y ARCHIVE, **no** en VOD.
- No afirmar que una pista es limpia si la canción llega ya mezclada dentro del micrófono Ray-Ban, el audio de un juego o el sonido de la habitación. No existe función mágica de descontaminar música.
- OBS documenta un **Twitch VOD Track** distinto para el replay. Para Wivra, el descriptor `dedicatedVODAudioVerified` **nunca** debe configurarse desde preferencias como si fuera garantía: solo después de negociación/capacidad confirmada por un **adaptador nativo Twitch**. La planificación no verifica que se haya recibido el audio.
- **YouTube, Kick, TikTok, Instagram, Facebook y RTMP personalizado**: no se les promete el soporte de Twitch VOD Track. Deben usar la copia local limpia hasta que se documente/verifique otra API oficial. **Kwai está excluido.**
- Un VOD sin música NO elimina el riesgo de reclamaciones durante LIVE ni concede derechos de retransmisión de canciones.

## Adaptadores futuros

| Interfaz | iOS/Android | Windows/macOS/Linux |
|---|---|---|
| SourceAdapter | DAT Ray-Ban o cámara teléfono; HFP/USB/entrada autorizada | Webcam, cámara de captura, micrófono USB/mezclador/entrada autorizada |
| MusicInputAdapter | Archivo local reproducible o fuente autorizada, sujeto a iOS/Android | Archivo local o salida de aplicación/loopback, sujeto a permisos y DRM del sistema |
| AudioMixerAdapter | Audio PCM / mezcla hardware/nativa con buffers y relojes | API de audio nativa o motor reutilizable con buffers y relojes |
| OutputAdapter | RTMPS y archivo local segmentado, cuando exista | RTMPS y archivo local segmentado, cuando exista |
| VODDeliveryAdapter | Por plataforma, nunca suponer universalidad | Igual, depender de las APIs disponibles |
| EditorBridge | Contrato de medios/manifiesto v2 con Claude | Misma biblioteca/editor, interfaz adaptada a escritorio |

La sincronización de pistas de audio y video exige un reloj común y mediciones de muestras: `audioStartOffsetSeconds` positivo = audio comienza después del video. Los archivos originales nunca se sobrescriben; video pendiente sigue el guardado explícito y el doble consentimiento para descarte de #95.

## Proyecto de escritorio (futuro, NO iniciado)

Si se crea un anfitrión escritorio, evaluar Electron o Tauri bajo los requisitos de captura, rendimiento, empaquetado y licencia de esa fecha. No trasplantar los SDK iOS/Android de Meta al sistema de escritorio: el Device Access Toolkit oficial es **móvil**. Si se quieren usar Ray-Ban desde una PC, podría investigarse un **puente móvil** Wivra teléfono→PC con cifrado, consentimiento y pruebas de red; no asumir conexión directa.

**Orden recomendado:** terminar y validar captura/guardado físico en móviles → mezclar fuentes móviles realmente capturadas → archivo VOD local distinto del directo → adaptador Twitch VOD Track probado → evaluar shell escritorio reutilizando `streaming/audio-routing.mjs` y el editor existente.

## Validación
`node --test streaming/tests/audio-routing.test.mjs` verifica tanto perfiles móviles como desktop de forma puramente lógica. La ejecución **no prueba** acceso a audio de sistema, derecho de uso musical, transmisión Twitch ni aplicación escritorio.
