# Revisión de `skousen1/agentcut` (otro proyecto con el mismo nombre)

> **Revisión de Claude, 13 oct 2026.** Lectura solo de consulta del repo clonado (último commit 11 oct 2026). **No se copió código ni texto.** Datos marcados **[V]** verificado (lo leí en el repo) o **[NV]** no verificado.

## Licencia: no podemos reutilizar su código

- **[V]** El repo **no tiene archivo de licencia** (ni `LICENSE` ni `COPYING`), `package.json` dice `"private": true` y no declara licencia. El README dice "gratis" y `SPEC.md` dice "open-source", pero sin licencia escrita la ley, por defecto, reserva todos los derechos al autor.
- **Consecuencia:** no copiamos archivos, funciones ni redacciones. Sí podemos aprender **ideas** (los conceptos no se copian) y escribir nuestra propia versión.
- **Siguiente paso posible (decide el propietario):** pedir al autor que agregue una licencia. Si elige una libre (MIT, Apache-2.0), se podría reutilizar con permiso. No escribí nada en su repo.

## Qué es

- **[V]** Aplicación de **escritorio**, de momento **solo Windows**, hecha con Next.js, Remotion (render por código), SQLite y ffmpeg. Corre en la computadora del usuario.
- **[V]** La "IA" no está dentro: el programa **lanza por línea de comandos** agentes de programación ya instalados (Claude Code, Codex, Cursor, OpenCode) y también expone un servidor MCP. Por eso funciona con cualquier IA, pero **no se puede llevar a un teléfono**, donde no existen esas herramientas ni un servidor local.
- **[NV]** Si funciona bien. No lo ejecuté.

## Ideas de diseño que vale la pena adoptar (reimplementadas por nosotros)

| Idea | Cómo la usaríamos en AgentCut |
| --- | --- |
| **La persona y la IA usan exactamente las mismas operaciones** sobre el mismo proyecto | Los botones táctiles y el chat llaman a las mismas funciones; nada de lógica solo en la interfaz |
| **Un único estado con número de revisión**: cada petición dice sobre qué revisión se basa; si el proyecto cambió, se rechaza | Evita que la IA pise lo que el propietario cambió a mano mientras ella pensaba |
| **Lotes de operaciones atómicos y validados** (todo o nada) | Ya previsto: el validador revisa el lote entero antes de aplicarlo |
| **Un mensaje a la IA = una entrada de deshacer** | Un solo "deshacer" revierte todo lo que hizo ese mensaje |
| **El plan es un documento editable**, no un registro: gancho, puntos, remate, cierre, cada uno ligado a un tramo | Para Reels: la IA propone el guion con tiempos y el propietario lo cambia antes de ejecutar |
| **Lo mecánico no pasa por la IA** (quitar silencios, sincronizar subtítulos): botón y IA llaman la misma función | Ahorra dinero y tiempo de espera |
| **La IA ve los fotogramas ya renderizados** (con textos y subtítulos), no solo los originales | Para revisar su propio resultado |
| **Glosario fijo** (nombre propio → grafía correcta) que alimenta la transcripción | Útil para nombres de calles y lugares |
| **Banco de correcciones**: cada cambio del usuario se anota; solo se convierte en regla si lo pide | Aprender el estilo sin molestar |
| **Contenido ajeno = no confiable**: transcripciones y paquetes de reglas se marcan como datos, no órdenes | Defensa contra instrucciones escondidas en videos o carteles |

## Lo que NO adoptamos

- Lanzar agentes por línea de comandos y el servidor local (no existen en un teléfono).
- Remotion y ffmpeg como motor (pesados para el navegador del teléfono; la licencia de Remotion para uso comercial **[NV]**).
- Su código, textos o marca.

## Nombre

Este proyecto ya usa **AgentCut** (ver issue #14). Eso refuerza cambiar el nombre antes de publicar fuera de GitHub.

— Claude
