# Wivra W75 · Consolidación P0 (Claude, 05-11-2026)

- **Rama:** `claude/wivra-w75-p0-consolidation-20261105`
- **PR en borrador:** #184
- **Base:** W74 de ChatGPT (#183, `efe18f9`, 3/3 en verde al empezar). Contiene W64–W74 de Claude, ChatGPT y Codex. No toca `main`.
- **Motor de exportación:** WebCodecs + Mediabunny sigue siendo el acelerado elegido, con `ACCELERATED_EXPORT_IMPLEMENTED=false`. MediaRecorder sigue siendo el predeterminado y la alternativa estable. W75 no cambia nada de eso.

## 1. Auditoría de W69 a W74

| Bloque | Qué aporta | Integración comprobada |
|---|---|---|
| W65–W67 (ChatGPT) | iPhone con dos cámaras mediante dos `AVAssetWriter` (iOS no admite dos `MovieFileOutput`), verificación de pistas, térmica, disco | Escribe `.wivra.json` con el bloque `multicam` de W64 |
| W69 (ChatGPT) | Recuperación de tomas dobles interrumpidas, con verificación antes de llevarlas al editor | `WivraMultiCamRecoveryStore` usa el mismo bloque `multicam`; llega al editor por el camino probado |
| W70 (ChatGPT) | Recibos y manifiestos de recuperación de escritura única | Sin conflicto con captura ni editor |
| W66 / W71 (Codex, ChatGPT) | Diagnóstico exacto de AVC/AAC y matriz de 6 casos (solo en QA) | Solo en la compilación QA; no se activa en producción |
| W72 (ChatGPT) | Último fotograma de las exportaciones de 10/20/30/60 min | Evidencia en Linux con VP9/Opus; **no** equivale a H.264/AAC en un teléfono |
| W73–W74 (ChatGPT) | Recuperación de MP4 acelerados en iOS y Android: 200 candidatos, cierre ante errores, archivos que cambian durante la lectura | Contratos y pruebas JVM y de macOS en verde |

Suites locales sobre W74: core 118, app 679 y streaming 469, todas en verde.

## 2. P0 corregido: caída del LIVE

- **Antes:**
  - iPhone: tras «LIVE activo» nadie vigilaba la conexión. Una caída de red dejaba «LIVE activo» en pantalla sin nada al aire.
  - Android: detectaba la caída, pero no reintentaba. Como la clave se borra al empezar, recuperar obligaba a cerrar la sesión.
- **Ahora:**
  - Política común en `core/live-reconnect.mjs`, con copia en Kotlin y en Swift: 6 reintentos (2/4/8/15/15/15 s) y el contador se reinicia al reconectar.
  - Nunca se reintenta con la clave o la aplicación rechazadas, si el usuario detiene o con almacenamiento crítico.
  - Android (LIVE de cámara y de pantalla): `reTry` de RootEncoder con la dirección que la librería ya tiene en memoria.
  - iPhone: vigilancia de `RTMPConnection.status`, reconexión y nueva publicación, y un aviso claro si se rinde.
  - La **copia MP4 local nunca se detiene por un reintento**, y la clave no se muestra ni se registra en ningún log.

## 3. Prueba de integración de punta a punta (nueva)

`tools/browser-capture-to-export.cjs`, dentro del workflow «Multicam Editor Import»:
1. Importa en el editor real un par de dos cámaras: principal roja con un tono de 440 Hz y secundaria azul sin audio.
2. Exporta con el motor estable (`recordProject`).
3. Comprueba sobre el archivo:
   - el recuadro azul arriba a la izquierda y el rojo en el centro;
   - el audio de la cámara principal presente (−21 dB, no silencio);
   - la duración, de 4,05 s.

## 4. Filas que se añaden a la matriz física de W71

La matriz completa está en `docs/W71_MOBILE_ACCEPTANCE_MATRIX.md` (ChatGPT). Estas filas se suman:

| Área | Prueba en un teléfono real | Evidencia suficiente |
|---|---|---|
| Reconexión del LIVE | Durante un live real con copia local, cortar el Wi-Fi o los datos 10 s y luego 90 s | Con 10 s, vuelve solo («LIVE reconectado»). Con 90 s, se rinde con un aviso claro. En los dos casos el MP4 local es continuo y se puede verificar |
| Clave rechazada | Iniciar con una clave inválida | No reintenta, avisa y no registra la clave en ningún log |
| Dos cámaras → editor (iPhone) | Grabar 1 min con las dos cámaras, abrir Capturas → editor | Video principal + recuadro con la sincronización hecha; un solo deshacer; solo suena la principal |
| Sonido del video en escenas | Live con «Cámara + video» y el sonido del video activado | El público oye el video y la voz; en el teléfono no hay eco |
| Pantalla + cámara (Android) | Pendiente: el código está en la rama sin terminar `claude/wivra-w65-screen-camera-wip-20261105` | — |

## 5. Tablero de estado (estimación técnica)

**Escala:** «Desarrollo» = código hecho. «CI» = compila y pasa pruebas automáticas. «Físico» = aceptado en un teléfono real; hoy es 0 % en todo, porque no hay ninguna prueba física registrada en el repositorio.

| Área | Desarrollo | CI | Físico | Justificación |
|---|---:|---:|---:|---|
| Editor y composición | 85 % | 85 % | 0 % | Multipista, capas, PiP, textos, filtros e importación de capturas; falta pulir la interfaz |
| Motor acelerado (WebCodecs + Mediabunny) | 75 % | 70 % | 0 % | Matriz QA, recuperación y exportaciones largas en Linux; sin H.264/AAC verificado en un teléfono y con la protección de producción activa |
| Audio y exportación multipista | 75 % | 70 % | 0 % | Mezcla, pistas independientes y MediaRecorder estable |
| Captura del teléfono | 80 % | 80 % | 0 % | CameraX y AVFoundation, recibos, recuperación |
| Ray-Ban Meta | 60 % | 55 % | 0 % | DAT, HEVC segmentado y unión de partes; sin gafas probadas |
| Multicámara y PiP | 75 % | 75 % | 0 % | Android compuesto en un archivo; iPhone con dos escritores → editor; recuperación |
| LIVE y grabación simultánea | 70 % | 65 % | 0 % | RTMP, 7 escenas, sonido del video, copia local, reconexión (W75); pantalla + cámara sin terminar |
| Recuperación y almacenamiento | 80 % | 80 % | 0 % | Escritura única, catálogos, Fotos/MediaStore |
| Interfaz, onboarding y accesibilidad | 45 % | 40 % | 0 % | Textos nativos en 8 idiomas; onboarding y accesibilidad todavía básicos |
| Seguridad | 80 % | 75 % | 0 % | Clave solo en memoria, consentimientos, permisos mínimos y FLAG_SECURE |
| Integración iOS | 70 % | 70 % | 0 % | Compila en Simulator y arm64; ningún dispositivo |
| Integración Android | 75 % | 75 % | 0 % | Compila las variantes full y capture con pruebas JVM; ningún dispositivo |
| Preparación de la beta P0 | 60 % | — | 0 % | Bloqueada por la prueba física autorizada y la firma |

## 6. Bloqueos reales

- **Prueba física:** no hay ninguna aceptación en un teléfono real. Los instaladores (APK/IPA) quedan reservados al hito que autorice el propietario.
- **Pantalla + cámara en Android:** los permisos están aprobados, pero el código está sin terminar en la rama WIP. Falta el manifiesto, actualizar las pruebas de pantalla de ChatGPT y compilarlo en el CI.
- **Motor acelerado:** su activación depende de H.264/AAC verificado en los dispositivos (W71/W72).

## 7. Siguiente macrobloque (W76)

Terminar «Pantalla + cámara» en Android a partir de la rama WIP:
- manifiesto con los tipos `camera` y `microphone`;
- contratos de pantalla de ChatGPT actualizados de forma explícita;
- compilación en el CI y prueba del modelo.

Después, revisión de accesibilidad y onboarding de las pantallas de captura y LIVE.

— Claude
