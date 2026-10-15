# Wivra LIVE · idiomas de interfaz, subtítulos y traducción

**Fecha:** 2026-10-15. **Alcance exclusivo:** producto de SOFTWARE de grabación/transmisión de video desde teléfonos y gafas compatibles, editor, subtítulos y traducción. Sin cambios de código, sin decidir disponibilidad física de dispositivos, sin asumir soporte de una región por el idioma de la app.

## 1. Localización de interfaz: 8 idiomas objetivo iniciales

| Idioma | Locale | Mercado o audiencia primaria | Etapa |
|---|---|---|---|
| Inglés | en | Estados Unidos, Canadá, Reino Unido, Australia, internacional | P0 |
| Español | es-419 + es-ES | Latinoamérica, España | P0 |
| Francés | fr + fr-CA | Francia, Canadá francófono, otras regiones | P0 |
| Alemán | de | Alemania, Austria y Suiza | P0 |
| Italiano | it | Italia | P0 |
| Japonés | ja | Japón | P0 |
| Portugués de Brasil | pt-BR | Brasil, editor de videos y creadores | P1 |
| Indonesio | id | Indonesia, editor de videos y creadores | P1 |

**Decisión pragmática:** lanzamiento mínimo viable de Wivra LIVE con **6 idiomas completos (en, es, fr, de, it, ja)** y arquitectura para **8 desde el inicio** (pt-BR e id en siguiente actualización según revisión lingüística). En el editor general se puede adelantar pt-BR o id sin bloquear soporte LIVE. La disponibilidad de SDK / API / gafas se detecta **por capacidad/dispositivo y región**, nunca por idioma. No prometer despliegue oficial de un fabricante a partir de este documento.

## 2. Idiomas de subtitulado, transcripción y traducción: 20 destinos objetivo

20 locales/idiomas de destino para el selector y las pruebas por motor:
`en`, `es`, `fr`, `de`, `it`, `ja`, `pt-BR`, `id`, `ko`, `zh-Hans`, `zh-Hant`, `ar`, `hi`, `vi`, `th`, `tr`, `nl`, `pl`, `ru`, `uk`.

**P0 de validación de calidad:** en/es/fr/de/it/ja/pt-BR/id/ko/zh-Hans/zh-Hant/ar (12). **P1** otros 8 según desempeño observado. La cantidad 20 es un **objetivo de producto**, no una promesa de compatibilidad automática en todo modelo. Idiomas de interfaz, idioma original de voz, idiomas de subtítulos y lenguas de traducción deben poder configurarse por separado.

### Reglas específicas para LIVE
- Subtítulos en directo: transcribir **solo audio autorizado**; VAD, segmentos con `start/end`, latencia y avisos al operador; política de fallback al idioma original o sin subtítulos.
- Traducción simultánea de subtítulos: cola de segmentos con tiempos y retraso transparente, sin reclamar latencia cero ni ocultar errores.
- El público puede ver subtítulos elegidos según capacidad del destino; overlays quemados en señal pública requieren decisión del operador.
- La lectura por voz/TTS traducida es función **separada** de los subtítulos, con routing privado/público y consentimiento explícito.
- Grabación + edición posterior: exportar pistas de subtítulos/idiomas por separado (`SRT`/`VTT`) o como imagen, sin borrar la transcripción original.

## 3. Interfaz propuesta

- Configuración → Idioma de Wivra (automático o manual) con locale estable.
- Editor → Subtítulos → Automáticos → Idioma detectado / Elegir origen → Revisar y corregir → Traducir → Idiomas destino.
- LIVE Studio → Subtítulos → Apagado / idioma original / traducción; mostrar destino, retardo estimado y si sale al programa o es previsualización.
- Asistente IA → entender instrucciones en idioma de UI, con textos localizados; nunca hacer depender editar manualmente de un modelo remoto.
- Cadenas vía catálogos y claves de mensaje, no traducción de texto DOM. Números, fechas, plurales y bidi/RTL para árabe.

## 4. Motores y costes

- Ruta local opcional: `Whisper` open model + runtime apto para plataforma (por ejemplo `whisper.cpp`), con límites medidos de RAM, batería, modelos descargados y calidad por idioma.
- Ruta OpenAI API opcional: solo con autorización para enviar audio, presupuesto/límite de uso, disponibilidad de modelos y reglas de datos verificadas. No equivale a ChatGPT Plus ni se asume gratis. `audio/translations` de Whisper está orientado a inglés, **no** a 20 idiomas; para destinos arbitrarios transcribir en idioma origen y traducir segmentos de texto con otro motor.
- UI nunca mostrará «subtítulos listos» si faltan `ASR`, `timecodes`, validación/preview o exportación. Registrar funciones no disponibles en modo offline.
- Pruebas de accesibilidad nativa, corrector regional y textos extensos; combinar idiomas no debe romper timeline, títulos ni overlays.

## 5. Revisión técnica solicitada a Claude (únicamente software)

1. Revisar HEAD real del Editor #44, no una captura histórica; identificar campos/textos hardcoded y el posible sistema de traducción existente.
2. Revisar este contrato de **6 idiomas iniciales + 2 de expansión** y **20 destinos de subtítulos**, y proponer ruta i18n única web/iOS/Android/futuro escritorio.
3. Auditar si el editor puede alojar pistas por idioma (`SubtitleTrack`) con ID estable, `lang`, in/out, origen/estado de corrección, reuso de proyecto, deshacer y exportación. Sin declarar concluido lo no implementado.
4. Coordinar con ChatGPT el esquema de audio/manifiesto (pistas mezcladas, offset y canales) para no generar transcripciones duplicadas.
5. Comparar modo manual, dictado y uso de asistentes con los mismos mensajes localizados; revisar la propuesta UI Chat First PR #64, sin fusionar ni sobreescribir la rama actual.
6. Devolver hallazgos y criterios de aceptación con tests de regresión, sin merge a `main` sin autorización.

**Referencias:** [Editor #44](https://github.com/Os-WHGo/Wivra/pull/44), [LIVE #59](https://github.com/Os-WHGo/Wivra/pull/59), [Chat First #64](https://github.com/Os-WHGo/Wivra/pull/64), [Coordinación #49](https://github.com/Os-WHGo/Wivra/issues/49).

**Este archivo define SOLO internacionalización y subtítulos del software.**
