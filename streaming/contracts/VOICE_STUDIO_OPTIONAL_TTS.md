# Wivra móvil + VoiceStudio · narración opcional

**ChatGPT · 16-10-2026 · Adaptador funcional de API, aún no conectado a la interfaz del móvil.**

## Fuentes verificadas

- VoiceStudio principal: https://github.com/debpalash/VoiceStudio
- API documentada (OpenAI-compatible): https://github.com/debpalash/VoiceStudio/blob/main/docs/agentic-voice.md
- Autenticación y uso LAN: https://github.com/debpalash/VoiceStudio/blob/main/docs/api-auth.md
- Licencia: https://github.com/debpalash/VoiceStudio/blob/main/LICENSE-NOTICE.md

VoiceStudio es principalmente una aplicación Electron o backend local de escritorio, **no una biblioteca TTS móvil nativa**. Su servidor escucha solo loopback de forma predeterminada. Para conectarse desde iPhone/Android requiere habilitar un servidor alcanzable y permisos, una conexión cifrada y autenticación. PIN sobre HTTP ordinario **NO cifra** los datos.

Licencias: aplicación **AGPL-3.0**; modelos y pesos tienen términos independientes, algunos pueden limitar el uso comercial, incluido el motor predeterminado. No se empaqueta código de VoiceStudio ni modelos en Wivra; este cliente HTTP independiente no demuestra por sí solo cumplimiento legal de todos los componentes, que debe revisarse antes de distribución.

## Entrega concreta

- Archivo: streaming/voice-studio-provider.mjs
- API: requestVoiceStudioNarration() llama a POST /v1/audio/speech por **HTTPS**, con token bearer y autorización explícita previa, genera WAV en memoria, limita a 16 MiB, rechaza redirecciones y respuestas que no son WAV. No guarda archivos ni importa automáticamente el resultado.
- Planner portable: createVoiceStudioNarrationPlan() no contiene información privada, claves, URL o texto completo.
- Tests: streaming/tests/voice-studio-provider.test.mjs comprueba aprobaciones, límite de datos, contrato y errores usando un servidor simulado, sin consumir cuotas ni activar comunicaciones reales.

Este código **no incorpora todavía** ninguna pantalla o comando del editor, no instala modelos, no clona voces, no sube grabaciones, no inicia LIVE, no modifica audio de captura y no hace nada en el teléfono hasta que una UI/nativo lo conecte de forma explícita. Una respuesta WAV en memoria no es todavía una pista editable de Wivra.

## Flujo objetivo, no habilitado

1. Propietario elige narración y revisa la licencia del modelo exacto y derechos de la voz.
2. Wivra configura URL HTTPS de su VoiceStudio confiable y clave almacenada mediante Keychain/Keystore del sistema (aún pendiente).
3. Envía únicamente el texto aprobado y recibe WAV, bajo la acción del usuario. Sin conexión predeterminada, sin subidas silenciosas y con límites de gasto/datos.
4. El usuario previsualiza y decide **importar** el WAV al proyecto: el editor único de Claude aporta assetId, pista, sincronización, undo, guardar y exportar. **Pendiente de Claude**.
5. En Wivra móvil sin servidor disponible, la app continúa trabajando normalmente offline.

## Coordinación

Claude conserva app/core, editor único, biblioteca, timeline y export. ChatGPT conserva origen de audio, rutas, consentimientos del adapter y privacidad. Tratar la generación como una pista distinta de audios originales, LIVE/VOD/ARCHIVE.

Pruebas reales pendientes: servidor VoiceStudio instalado por usuario, TLS y servidor autenticado, modelo con licencia compatible, iPhone y Android físicos, tiempo/energía y reproducción/importación. No confundir mocks Node con validación del servidor.

El nombre **Voice Studio** no es unívoco. También existen msrbuilds/voice-studio (MIT para el proyecto) y modelscope/ClearerVoice-Studio (Apache-2.0, limpieza/separación). Este contrato apunta a **debpalash/VoiceStudio**, no a esos otros proyectos.

No merge a main ni cambios a editor o módulos nativos.
