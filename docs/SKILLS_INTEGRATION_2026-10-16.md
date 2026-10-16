# Skills externas en Wivra: instalación, pruebas y matriz de capacidades

> Informe de Claude · 2026-10-16 · pedido del propietario. **Nada de esto toca el editor ni `main`.**
> Estados: INSTALADO = archivos en el proyecto · PROBADO (local) = corrió en el entorno de Claude, NO en un iPhone · PENDIENTE.

## 1. Qué quedó realmente instalado

Instalación **selectiva y local al proyecto** (`.claude/skills/`), prefijo `jake-`, con reglas de Wivra al inicio de cada skill. Los scripts son idénticos al original (comparados byte a byte). Licencia MIT de Jake Schincariol en las 4 repos (revisada); avisos en `.claude/skills/THIRD_PARTY_NOTICES.md`; cada carpeta tiene `UPSTREAM.md` con commit fijado.

| Skill | Origen | Estado | Prueba hecha (entorno de Claude) |
|---|---|---|---|
| `wivra-media-inspect` | ChatGPT, PR #113 | INSTALADO (viene en #113) | 12 pruebas unitarias OK; lectura real de un WebM y un MP4 sin audio OK; originales sin cambios (md5); archivo inexistente/corrupto da error limpio |
| `wivra-mobile-qa` | ChatGPT, PR #113 | INSTALADO (viene en #113) | 21/21 marcadores de código presentes; **0 pruebas físicas** (todas «NOT RUN», correcto) |
| `jake-edit` (master-skills/edit) | MIT | INSTALADO (solo probe, deadspace, captions, mediakit) | `probe.py --doctor` y `--loudness` OK; `deadspace.py --dry-run` halló las mismas 2 pausas que nuestro «Quitar silencios» (12,0 s → 6,5 s frente a 6,4 s); 13 pruebas unitarias del autor OK |
| `jake-yt-edit` | MIT | INSTALADO | `deadair.py` con un SRT de prueba: encontró el hueco y la muletilla OK |
| `jake-yt-shorts` | MIT | INSTALADO (solo texto, sin script) | Solo método; no ejecutable |
| `jake-yt-retention` | MIT | INSTALADO | Corre, pero necesita una exportación real de YouTube Studio (≥8 puntos): **no probado con datos reales** |
| `jake-ig-reel` | MIT | INSTALADO (con avisos) | `hookscore.py` y `beats.py` corren; **pensados para inglés**: en español puntúan bajo (30/100 a un gancho con cifras) |
| `jake-ig-repurpose` | MIT | INSTALADO (solo texto) | Solo método |
| `jake-replica-recon` | MIT | INSTALADO (plantillas) | Solo método; `features.csv` lo lee `parity.py` OK |
| `jake-replica-test` | MIT | INSTALADO (plantillas) | Solo método; sus pruebas de ejemplo no se ejecutan (son para otra app) |
| `jake-build-qa` (solo `contrast.py`, `sitecheck.py`, `serve.py` local y lista de QA de master-skills/build; el `SKILL.md` es de Wivra) | MIT | INSTALADO (solo herramientas de revisión) | `sitecheck.py` en modo carpeta sobre el HTML del editor: 12 errores y 4 avisos de accesibilidad (ver §6); `contrast.py` corre OK |
| `jake-replica-diff` | MIT | INSTALADO | `parity.py` OK con la plantilla; 14 + 10 pruebas del autor OK (`imgdiff`, `parity`) |

**NO instalado, a propósito**
- `replica-build`: construye un clon de otra app. Choca con «no queremos un segundo editor» y con la regla 3 de AGENTS.md. ChatGPT también lo excluyó en #113.
- `build` (master-skills) **completa**: es para crear sitios web desde cero y publicarlos (Netlify/Vercel/…); Wivra es una app ya definida. Se instaló **solo su parte de revisión** como `jake-build-qa` (ver arriba), siguiendo la sugerencia de ChatGPT en #49.
- `arena-skill` y todo lo demás de esos repos. Tampoco `faster-whisper`, HyperFrames, Remotion, video-use, Playwright (se usa el que ya trae el entorno).

**Limitación importante (verificado):** en la sesión actual de Claude, las skills nuevas **no aparecen** en la lista de skills (probé `wivra-media-inspect` y respondió «Unknown skill»). Claude Code las detecta al abrir una sesión nueva dentro de este repo con esta rama. Hasta entonces, se usan leyendo el `SKILL.md` y ejecutando sus scripts a mano, como hice en las pruebas. **No puedo confirmar que aparezcan en tu cuenta de Claude** sin que abras una sesión así.

Seguridad revisada antes de copiar: sin red salvo `sitecheck.py` (no copiado), sin `shell=True`, sin instalaciones automáticas, sin claves ni caracteres ocultos; los comandos de instalación que citan (`npx`, `pip`, `brew`, `git clone`) quedan prohibidos por las reglas de Wivra al inicio. `ig-reel` quería escribir en `~/.claude/instagram/`: se anuló.

## 2. Duplicaciones e incompatibilidades

| Tema | Hallazgo | Decisión |
|---|---|---|
| Inspección de medios | `wivra-media-inspect` (captura/Ray-Ban, FPS, rotación) y `jake-edit/probe.py` (además mide volumen, VFR, HDR) | Complementarias: usar la de Wivra para captura; `probe.py --loudness` para medir volumen |
| Quitar silencios | Ya existe en el editor (PR #114) | No duplicar. `deadspace.py` queda como **verificador independiente** y como guía para muletillas |
| Estudiar otras apps | Ya hay `docs/PRIOR_ART.md` y `docs/OPEN_SOURCE_MAP.md` | `jake-replica-recon` solo para completarlas, sin carpeta `replica/` en el repo |
| Ganchos y ritmo | `core/shoot-checklist.mjs` ya tiene consejos de gancho | Tomar ideas (gancho ≤3 s, planos cortos); código propio en español |
| QA | `wivra-mobile-qa` (código fuente) y `jake-replica-test` (método de pruebas) | Distintas: no chocan |
| Transcripción | `jake-edit/captions.py` pide `faster-whisper` (no instalado) | Wivra decide aparte la transcripción en el teléfono (issue #6); mientras tanto sirve cualquier SRT |

## 3. Matriz de capacidades (Wivra hoy frente a lo que aportan las skills)

«En el editor» = implementado en las ramas de Claude (PR en borrador), aún sin fusionar a `main` y **sin probar en iPhone real** salvo que se diga lo contrario.

| Capacidad | En Wivra hoy | Qué aporta la skill | Cómo incorporarlo (idea original) |
|---|---|---|---|
| Cortar, recortar, mover, borrar clips | En el editor | — | — |
| Capas, formas, marcos, opacidad | En el editor | — | — |
| Filtros y ajustes de color | En el editor | — | — |
| Efectos de entrada/salida | En el editor (`set_clip_fx`) | — | `set_transition` entre clips: pendiente de decisión del propietario |
| Formato 9:16 / 1:1 / 4:5 / 16:9 | En el editor | `jake-edit`: reencuadre 16:9→9:16 | Ya cubierto; auto-reencuadre con cara: **no existe** |
| Texto en pantalla con estilo | En el editor (PR #112) | zona segura 1080×1920 (x 90–950, y 240–1470) | Guía de zona segura al editar texto: **nuevo, fácil** |
| Subtítulos (importar/exportar SRT) | En el editor | — | — |
| Transcripción automática | **No** (la app dice «Próximamente») | `captions.py`, yt-edit | Whisper en el teléfono: depende de medir en iPhone (issue #6) |
| Subtítulos palabra por palabra | **No** | `captions.py` (frases de 1–3 palabras) | Necesita tiempos por palabra de la transcripción |
| Quitar silencios | En el editor (PR #114), solo si el usuario lo pide y revisa la propuesta | `deadspace.py` (verificado) | Hecho. Ojo: en videos POV, senderismo o conciertos el silencio suele ser intencional; nunca automático |
| Quitar muletillas y repeticiones | **No** | `deadspace.py`, `deadair.py` | Después de la transcripción |
| Normalizar volumen (objetivo −14 LUFS) | **No** | `jake-edit` §9: ganancia fija + limitador −1,5 dBTP, sin compresor. **−14 es el estilo del autor, no una norma universal** (no verificado qué hace cada plataforma) | **Prioridad 1**, como **opción** con objetivo elegible, no obligatoria |
| Plantillas y montaje rápido | En el editor | — | — |
| Elegir Shorts/Reels de un video largo | **No** | `jake-yt-shorts`, `jake-ig-repurpose` (criterios) | Después de la transcripción; el Director propone, el usuario decide |
| Avisos de ritmo (gancho, planos, final en bucle) | **No** | `beats.py` (ideas) | **Prioridad 2**: reglas en español dentro del Director |
| Puntuar ganchos | **No** | `hookscore.py` (solo inglés) | Solo si se reescribe para español; prioridad baja |
| Retención de audiencia | **No** | `retention.py` | Requiere datos de YouTube del propietario; baja |
| Velocidad, estabilización, reversa, croma | **No encontrado** | — | Fuera de esta ronda |
| Pruebas automáticas del editor | Pruebas de Claude (192 de app, 81 de core, 6 E2E en Chromium) | `jake-replica-test` (lista de casos límite), `jake-replica-diff` (diff de capturas) | **Prioridad 3**: plan de casos límite y regresión visual de pantallas |
| Matriz de funciones con puntaje | Este documento | `parity.py` + `features.csv` | Pasar esta tabla a CSV para medir avance |

## 4. Prioridades de integración que recomiendo

1. **Volumen parejo al exportar**, con objetivo elegible (−14 LUFS por defecto como propuesta; receta de `jake-edit`, código propio con Web Audio). Corre en el teléfono.
2. **Avisos de ritmo del Director** en español (gancho ≤3 s, planos largos, final en bucle).
3. **Plan de pruebas con casos límite + regresión de capturas** (formato `jake-replica-test`, `imgdiff` para comparar versiones de Wivra).
4. **Guía de zona segura** para el texto.
5. Después de medir la transcripción en iPhone real (#6): muletillas, subtítulos palabra por palabra y selección de Shorts.

## 5. Hallazgos de accesibilidad (primer uso real de `jake-build-qa`)
Sobre el HTML estático del editor (no ejecuta JavaScript; los controles creados por scripts no se revisan):
- 6 botones de color de la capa (`#ovColors`) sin nombre accesible.
- 6 campos sin etiqueta (solo tienen texto de ejemplo): texto de la hoja de texto, descripción y edición rápida del Director, inicio/fin del recorte, y el selector de archivo de cámara.
- Avisos: falta `meta description`, un enlace `href="#"` (clave de IA) y no hay favicon.
**No los he corregido** (en esta ronda no se modifica el editor): quedan como tarea propuesta, pequeña y de bajo riesgo.

## 6. Pendiente / necesita al propietario
- Abrir una sesión nueva de Claude Code en este repo con esta rama para confirmar que las skills aparecen. (Necesita una computadora o la app de escritorio; no es posible solo con el teléfono.)
- Decidir si se fusiona este PR cuando #113 esté aprobado. Está apilado sobre #113 (rama de ChatGPT), nada va a `main`.
- Ninguna prueba se hizo en iPhone/Android reales.

— Claude
