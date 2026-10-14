# Wivra · CG 2D compartido para LIVE Studio y editor
**Aclaración del propietario, octubre 2026:** **CG = gráficas de pantalla / character generator**, tales como cintillos, lower thirds, títulos, titulares, memes e imágenes, NO CGI 3D ni generación IA pesada. El usuario acepta propuestas de Wivra LIVE Studio, pero requiere que **los mismos CG se reutilicen en editor**, sin recrearlos ni descargar paquetes cada vez.

**Estado:** definición de producto/contrato/aceptación. NO hay motor CG, reproductor LIVE RTMP, control deck, multicámara ni integración editorial implementados/validados. Fuente de verdad GitHub. No fusionar main sin autorización.

## 1. Un catálogo, dos contextos

**Biblioteca compartida de CG de Wivra:**
- Elementos 2D editables: texto/títulos/subtítulos cortos, lower-third nombre/cargo, noticia absurda/reportaje, banda URGENTE, cartel de precio, dato del día, ubicaciones, comparaciones, cronómetro/contador, logo, banner, sticker, imagen/flyer importado, meme permitido.
- Medios de usuario: PNG/JPEG/WebP/SVG seguro, clips de video con formatos realmente soportados y sonidos importados con derechos. Sin descargar memes, música o marcas de terceros automáticamente.
- Presets propios y compactos: fondo/contorno/tipografía incorporada con licencia, color, posición, tamaño, márgenes safe-area, entrada/salida fade/slide/zoom **2D**, duración, alineación, animaciones temporizadas sencillas. Sin renders pregrabados pesados para cada combinación.
- Guardar **template** y **instancia** por separado: «Noticiero absurdo» como plantilla; «Hoy caminando a comprar pan» con título y precio como instancia. Reutilizar en otro proyecto o live.
- Paquete inicial con 5–10 plantillas realmente útiles, GRATIS y OFFLINE en el teléfono. Presets adicionales opcionales solo tras aprobación; no «biblioteca premium», créditos ni descargas obligatorias. La IA editora no es necesaria para producir un CG.

**Dos ejecuciones de LA MISMA definición:**
1. **LIVE Studio:** seleccionar una escena previsualizada y tocar botón de Control Deck para mostrar/ocultar CG al aire, fijarlo, sustituir texto, activar duración, reproducir clip o lanzar una tarjeta. Debe conservar opción de retirar inmediatamente y evitar aparición accidental antes de pulsar «Al aire».
2. **Editor:** añadir exactamente esa plantilla CG a pista G1/G2 o overlay V2; controlar inicio/fin, texto, posición, tamaño, z-index, opacidad, animación 2D, keyframes opcionales, duplicar, split/trim, mute de media cuando corresponda, undo/redo y export. Los CG que aparecieron en directo pueden archivarse como eventos editables de tiempo en proyecto LIVE-to-Editor.

**Regla crucial:** compartir **datos de plantilla, identidad de assets, parámetros y operación/compositor semántico**, no asumir que Swift/Metal/AVFoundation y navegador de Claude comparten ejecutable GPU. Usar adaptadores de render separados si hace falta, asegurando conformidad visual de LIVE, preview del editor y export con snapshots/golden tests.

## 2. Contextos visuales: transmisión y edición

**LIVE principal:** Ray-Ban POV/iPhone, PiP frontal opt-in donde sea posible, split screen, collage 2/3/4 medios. La capa CG vive en el mismo grafo compositivo con z-order y rect normalizado; un overlay de rótulo NO consume una cámara adicional. No mostrar rostro real por defecto. El usuario puede escribir/editar en teléfono durante transmisión, pero con flujo de preparación/preview para evitar errores al aire.

**LIVE reacción:** importar un video local permitido, preparar/cargar, situarlo en PiP o mitad de pantalla, reproducir/pausar desde botón, ajustar audio del clip versus voz elegida y volver al POV. Reproducir archivos no implica retransmitir videos protegidos sin derechos. Si falla decodificación, avisar en preview ANTES de emitir. Multidestino/plataformas RTMP condicionados a permiso de cuenta, aún por construir.

**Editor offline:** CG como pista o capa temporal independiente, render completo a export, no elemento HTML sobrepuesto solo en preview. Movimiento/cortes y transiciones entre escenas no borran ni duplican CG si cruza escena; se aplica política explícita de mantener/ocultar/cortar/fundir. Conservar originales. Se integra con timeline V/A/caption/effect y selector de scopes de filtro.

## 3. Esquema conceptual portable (NO API implementada)

```ts
type CGTemplate = {
  id: string;
  version: number;
  name: string;
  kind: "lower_third" | "headline" | "price" | "info" |
        "logo" | "sticker" | "image" | "counter" | "freeform";
  fields: Record<string, string | number | boolean>;
  defaultStyle: {
    x: number; y: number; w: number; h: number; // rect 0..1
    opacity: number;
    layerOrder: number;
    fontRef?: string; color?: string;
    textSafeArea?: number;
  };
  animation?: {
    enter: "none" | "fade" | "slide" | "scale";
    exit: "none" | "fade" | "slide" | "scale";
    durationMs: number;
  };
};
type CGInstance = {
  id: string;
  templateId: string;
  overrides: Record<string, unknown>;
  assetRefs: string[]; // archivos locales, rutas seguras, permisos
  startSeconds?: number; // editor
  endSeconds?: number;   // editor
  visible: boolean;
};
type LiveCue = {
  id: string;
  action: "showCG" | "hideCG" | "switchScene" | "playMedia" | "stopMedia";
  targetId: string;
  durationSeconds?: number;
};
```
No usar objetos genéricos `overrides` sin validación; esquema real deberá validar tipos, límites, posición, assets, tamaño/longitud del texto, fuentes disponibles, derechos y versión. LiveCue no se ejecuta por importación de JSON sin acción humana.

**Persistencia:** CGTemplate compartida; CGInstance vinculada al proyecto; listas de LiveCue vinculadas a preset del control deck. Al abrir un proyecto antiguo, migrar/esquemas versionados sin perder assets. Guardar eventos LIVE como timestamp y acción relativos al inicio en vez de depender de relojes no sincronizados; si se pierde señal, registrar huecos correctamente.

## 4. Control Deck 1 teléfono primero

- Pestañas conceptuales: **Escenas**, **CG**, **Medios**, **Audio**, **Estado** (no requieren cinco apps).
- Botones programables con icono/etiqueta y estado real, diferenciando `Preparado` y `Al aire`; mostrar video/reacción, tarjeta info, flyer, titular, meme, esconder, escena PiP, split, avatar, pantalla de espera.
- Pulsar CG: abrir preset con campos editables rápidos; previsualizar; **Mostrar**; **Ocultar**. La acción directa con un toque solo si asset ya preparado y el usuario habilita modo acceso rápido.
- Pulsar video: preflight carga local, decoder/video+audio listo, duración y derechos; previsualizar; elegir layout/reproducción, tomar al aire; controles pausar/silenciar/detener. Los archivos privados nunca se suben a proveedor en la nube automáticamente.
- Los elementos no disponibles/descargados muestran estado, no botón engañoso. Modo vertical y landscape, controles grandes, VoiceOver.
- **Segundo teléfono como control remoto / retorno / comentarios** queda fase posterior. No depender de ello para lograr funciones esenciales en primer teléfono, ni asumir API oficial de chat/viewer stats de IG/TikTok.
- **Alertas**: distinguir avisos operativos del stream (red/fps/temperatura) de CG gráficos «Nueva alerta», y de alertas de plataforma (follow/subscription/donations). Estas últimas necesitarán API autenticada y autorización, NO se integran sin permiso/viabilidad.

## 5. Criterios de aceptación (gratis, no 3D)
1. Crear CG «Reportaje absurdo»: título, subtítulo, marco sencillo, diseño seguro 9:16/16:9; guardar como plantilla. Sin nube/IA.
2. En el editor, insertar el CG en t=4–9s; arrastrarlo, duplicarlo, modificar título, aplicar fade y exportar: texto/fuentes/animaciones igual que vista previa; proyecto guardar/reabrir, undo.
3. Usar ESA MISMA plantilla en LIVE, preparar título distinto y pulsar Mostrar; CG sobre cámara/medio, Ocultar instantáneo, señal estable sin cámara adicional; NO afirmar prueba de LIVE mientras el codificador no esté implementado.
4. Reacción POV+video local con split/PiP y opcional banner; controlar reproducción del clip/voz; si falta formato mostrar error. No retransmitir sin derechos.
5. Grabar el directo compuesto y sus cue events; posteriormente abrir en editor y ajustar tiempo/posición de CG. Si solo existe la grabación «aplanada», no fingir que es una capa editable: conservar/exportar eventos y assets por separado.
6. Modo avión después de instalar y cargar medios locales: plantillas y export del editor siguen funcionando. LIVE naturalmente precisa red. App inicial liviana y gratis; medir RAM/CPU/fps/bundle sin inventar MB.

## 6. División de trabajo

**Claude (PR #44)** mantiene editor y timeline, importación de asset CG, pista G1 / overlay de CG, parámetros, persistencia y export, biblioteca de presets original. No crear motor de captura/LIVE.

**ChatGPT (captura PR #51 / futuro LIVE):** scene deck y su interfaz en módulo Live Studio, compositor/enrutador de destinos, Media Launcher en transmisión, control de estado y eventos LIVE-to-Editor. **Coordinar contrato compartido con Claude en issue #49 antes de duplicar código**; no reescribir `app/`, `core/`.

**Meta AI:** investigación Meta DAT + dispositivos, opcionales aspectos de CG/voz si se le consulta; no convertir en backlog catálogos de memes ni hardware enfriador.

[línea retirada]

**Fuente de verdad:** código/contratos GitHub, documentos de Meta AI solo investigación; user decide qué se implementa, sin merge automático a main.

— ChatGPT


## 7. DECISIÓN FINAL: una sola aplicación con Editor y LIVE Studio; CGI fuera

**Aclaración explícita posterior del propietario:** quiere **TODAS las ideas funcionales de Wivra LIVE Studio** propuestas (Scene Deck, lanzar video local, reacciones caminando, PiP/split/collage, flyers, lower thirds, alerta visual, CG de rótulo, control de audio, biblioteca de memes, guardado LIVE→Editor), y que **las mismas gráficas/medios/plantillas** se usen en el editor. **No quiere CGI entendido como efecto especial generado mediante 3D ni generación de efectos visuales pesada/IA en tiempo real**, que consumiría cómputo/red. Los CG 2D existentes no constituyen CGI: texto, rectángulos, PNG, animaciones simples, composiciones ya renderizables y reutilizables.

**Respuesta arquitectónica cerrada: UNA aplicación Wivra, NO dos apps.** Dos modos de trabajo en navegación: **Editor** (montaje offline multipista, export, Director IA opcional) y **LIVE Studio** (captura + compositor en tiempo real + RTMP(S) + control deck). Opcional accesos Capturar, Biblioteca/Proyectos, Ajustes. No lanzar dos procesos/apps independientes como requisito. La UI de LIVE debe tener controles de botones grandes y vista previa, NO la timeline profesional completa mientras transmite; luego abrir proyecto LIVE en Editor para ajustes finos. Una sola biblioteca y sistema de proyectos para evitar importaciones duplicadas y mantener recursos locales.

**Aislación técnica correcta:** motor de reproducción/export y renderer del editor (Claude) pueden diferir del compositor nativo LIVE (ChatGPT) porque latencia, duración, codecs y carga térmica son distintos. COMPARTIR esquema/recursos/semántica visual entre los dos, no forzar un runtime único ni duplicar editor en streaming. Consumir plantilla compartida con dos adaptadores y test visual de salida. Un solo teléfono soporta el flujo inicial; un segundo teléfono para ver retorno/control remoto es mejora posterior opcional. Una aplicación ≠ pretender edición compleja multitarea mientras livestream; LIVE utiliza editor rápido de CG y scene deck, y el editor completo queda para después.

### Biblioteca de memes accesible desde ambos modos

- **Biblioteca Local:** botón Memes en LIVE y en Editor; archivos subidos/importados por usuario (imagen/video/GIF de formato compatible) y una colección pequeña de stickers/plantillas ORIGINALES o recursos **con licencias reusables verificadas individualmente**. El usuario puede añadir favoritos, etiquetas, buscar, previsualizar y fijar para botones de acceso rápido. No imponer nombres/catálogo de memes comerciales ni insertar contenido sin autorización.
- **Biblioteca Online opcional:** cuando hay internet y proveedor autorizado, buscar/preview, seleccionar y descargar a proyecto según licencia/condiciones/copyright y caché permitida. No prometer que Tenor/GIPHY/Imgflip permiten incrustar o redistribuir cualquier asset, no almacenar permanentemente ni retransmitir memes protegidos sin derechos.
- **LIVE:** preparar meme antes de ponerlo al aire, mostrar/ocultar en CG layer, ajustar tamaño/posición/tiempo y opcional audio; lanzar desde Deck si ya está en caché. No bloquear emisión si sin red y la colección local existe.
- **EDITOR:** misma referencia AssetId y preset; insertar en V2/G1 con tiempo/posición/animación, keyframe opcional, undo/trim/duplicar/export. No volver a bajar el meme ni renderizarlo a video cada vez.
- **Avisos:** protección ante material con sonido alto, derechos inciertos, encuadre que tape cara/cámara, permisos y cambios de aspecto. Todo gratuito en funcionalidades locales; costos de internet o APIs externas nunca ocultos.

### Contrato de integración y propiedad

`SharedAsset {id, kind: image|video|audio|sticker|meme|cg_template, localUri, sourceLicense?, attribution?, duration?, size?, createdByUser}` (conceptual; no código). `CGTemplate` + `CGInstance` de este documento se mantienen iguales para Editor y LIVE. `LiveCue {action, targetId, duration}` guarda eventos al tiempo de transmisión. Biblioteca persistente, no-cloud por defecto, acceso por ID en ambos modos; gestionar estado de permiso local/archivos borrados, migración de esquema y resolución de fuentes/licencias.

**Puente LIVE→Editor:** guardar una grabación compuesta opcional y una lista de eventos (e.g. scene change, show/hide CG, video reaction start/stop) junto a medias originales si se conservaron. Después editar/reordenar los CG y memes como pistas editables **solo si existen los assets y eventos**; si únicamente se almacenó MOV final mezclado, no fingir capas recuperables.

### Entregables para desarrollo, sin crear otra app

1. Claude debe evaluar la **biblioteca compartida, importación y CG temporizado en Editor**, con render/export off-line, duraciones y estado de proyecto, sin reescribir el capturador.
2. ChatGPT diseñará Deck y CG Live Launcher en `streaming/`, ingest de medios y estado on-air/preview, con un solo motor de composición de LIVE y sin depender del editor de Claude.
3. Contrato de assets, codecs soportados, pack local, escenas de CG y evento LIVE, acordado entre ambas ramas antes de integración. Estado: **NO implementado**.
4. Pruebas: crear meme/tarjeta una sola vez → lanzar en LIVE (cuando disponible) → reutilizar mismo archivo en Editor → export mismo diseño; retirar LIVE instantáneo; mostrar video reacción PiP; memoria/latencia/offline sin duplicación ni cobro. No avanzar con CGI complejo, VR, generadores de avatar 3D ni IA generativa en directo.

**No merger a main sin aprobación.** No actualizar prioridades hacia hardware refrigerador, monetización tours o catálogo viral externo por recomendaciones de investigación.


## 8. Más usados y Alertas

Una sola biblioteca de memes, imágenes, videos y CG debe ofrecer Favoritos, Recientes, Más usados y Sugerencias útiles tanto en Editor como en LIVE. Contar usos efectivos y mantener estadísticas en el teléfono. Las alertas de LIVE se diseñan en Wivra: manuales por un toque o automáticas a partir de eventos autorizados de plataformas. La stream key RTMP no entrega followers ni comentarios; los conectores OAuth/API son independientes. Detalles, seguridad y pruebas: [WIVRA_SHARED_ASSET_FAVORITES_SUGGESTIONS_LIVE_ALERTS_2026-10-13.md](./WIVRA_SHARED_ASSET_FAVORITES_SUGGESTIONS_LIVE_ALERTS_2026-10-13.md).
