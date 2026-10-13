# OpenCut (versión clásica): evaluación para AgentCut

> Revisión de Claude, 13 oct 2026, pedida por el propietario ("quiero trabajar con esa versión").
> **[V]** = verificado leyendo el código o corriéndolo; **[NV]** = no verificado. Todo lo probado fue en Chromium **simulando** un iPhone 13, **no en un iPhone real**.

## Qué es
- `opencut-app/opencut-classic` (último commit 17 may 2026) **[V]**. Es el editor que se abre en opencut.app **[NV: lo dice su README]**. Tipo CapCut: biblioteca de medios, línea de tiempo, vista previa, panel de propiedades, exportar, efectos, máscaras, subtítulos, transcripción (carpetas en `apps/web/src`) **[V]**.
- **Licencia MIT**, "Copyright 2025-2026 OpenCut" **[V]**. Se puede copiar y modificar citando la autoría.
- Tecnología: Next.js 16, Rust compilado a WebAssembly (`opencut-wasm`), mediabunny, zustand, Bun **[V]**. Arranca localmente con `bun install` y `bun run dev` **[V]**; no pidió base de datos para abrir el editor **[V]** (el proyecto se guarda en el navegador **[NV]**).
- Lo nuevo (`opencut-app/opencut`, último commit 24 sep 2026) es una **reescritura** en Rust. Su README promete: API de editor, plugins, **servidor MCP para agentes de IA**, modo sin interfaz, escritorio y móvil desde un solo código **[V: es una promesa, no una función existente]**. Vive en new.opencut.app hasta estar lista **[NV]**.

## Lo que se puede aprovechar
- Un editor completo ya hecho, con licencia permisiva.
- **Capa de acciones** (`src/actions/`): comandos con nombre como `split`, `delete-selected`, `undo`, `redo`, `toggle-play`, `seek-forward` **[V]**. Es el lugar natural para que una IA ejecute órdenes. Falta una capa que valide, como la de `core/`.

## Lo que NO sirve tal cual
- **Pantalla "Desktop only (for now)"**: avisa que "no está optimizado para móvil ni iPad; se romperá el diseño". Se salta con "Take a look anyway" **[V]**.
- **Arrastrar medios a la línea de tiempo usa arrastrar-y-soltar de HTML5** (`draggable`), poco fiable con el dedo en iOS **[V en el código; NV en iPhone real]**. Esto explica el fallo del issue #1.
- **Pero hay un botón "+" en cada medio que sí lo agrega con un toque.** Estaba invisible (`opacity-0`, solo aparece con el ratón encima) **[V]**. En la simulación, tocar esa esquina inferior derecha del medio puso el clip en la línea de tiempo **[V, simulado]**.

## Parche incluido (`patches/opencut-classic/0001-…patch`)
Hace visible y más grande el botón "+" en pantallas táctiles. Dos líneas. En la simulación el botón pasó de invisible a visible **[V, simulado]**. Aplicar con `git apply` sobre `opencut-classic`.

## Riesgos
- Está pensado para escritorio; lo táctil necesitará más arreglos (línea de tiempo, recorte con el dedo, paneles) **[NV: tamaño del trabajo]**.
- La rama "clásica" puede quedar sin mantenimiento por la reescritura.
- Para probarlo en un teléfono hay que **alojarlo en algún sitio** (una app Next.js, no una página suelta). Eso crea una dirección pública y es decisión del propietario.
- Exportar, audio y videos largos en iPhone: **[NV]**.

## Opciones
1. **Probar tal cual en el teléfono, en horizontal**, tocando el "+" (necesita alojarlo).
2. **Bifurcar `opencut-classic`** en la cuenta del propietario, aplicar el parche, y agregar ahí un panel de IA que use `core/`.
3. **Seguir con nuestro editor ligero** (`app/`) y copiar ideas o código de OpenCut con atribución.

— Claude
