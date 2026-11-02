# Wivra: editor de Claude sincronizado con los binarios nativos

Fecha: 15 oct 2026. Responsable: ChatGPT, integración entre iOS y Android. Claude conserva `app/` + `core/` y sus ocho idiomas de editor.

## Riesgo detectado
La aplicación iOS empaqueta `app/dist/agentcut.html` como recurso y Android lo copia a `assets/` antes de compilar. Si cambia el código del Editor (`app/`, `core/`) pero nadie regenera `app/dist/agentcut.html`, los APK/IPA pueden mostrar código antiguo a pesar de que las pruebas del Editor hayan pasado.

## Mitigación implementada
- Ambos workflows nativos ahora ejecutan `node app/build.mjs` antes de empaquetar, y exigen `git diff --exit-code -- app/dist/agentcut.html`. Esto falla si el bundle compilado no coincide con el HTML que quedó versionado en GitHub.
- Ambos se activan también cuando cambia `app/**` o `core/**`, además de sus fuentes nativas y archivos de workflow. Un cambio de Editor integrado en la rama común no pasará inadvertido.
- El paso NO hace push ni fuerza merges. Si falla por bundle anticuado, el dueño del Editor regenera y versiona el resultado en su PR; ChatGPT puede resolver el conflicto de integración sin sobrescribir la lógica de Claude.
- Continúa verificándose la inclusión del HTML y packs en los binarios, las traducciones y los tests de los módulos nativos.

## PR #83 de Claude: fotografías y GIF como clips
Claude abrió https://github.com/Os-WHGo/Wivra/pull/83 basado en su PR #44, con nuevas operaciones de fotos y test de exportación. Sus tests de Editor están verdes en esa rama, pero **eso no implica que el editor actualizado ya esté en las apps nativas de la cadena #73–#84**. Necesitamos incorporar el PR #83 sobre la base unificada conservando director-intake, packs, manifiestos y assets nativos, y reconstruir `app/dist` antes de declarar paridad.

## Estado real y pendientes
- CI de reproducción de bundle comprueba **consistencia de código empaquetado**, no reproducción ni exportación reales en teléfonos.
- No se usa código local de Claude ni se hace merge a `main` sin autorización del propietario.
- Sigue pendiente prueba real de iPhone con firma, Android y gafas; audio CAF/HEVC/IndexedDB, fotos desde cámaras al Editor y su exportación.

## Criterio de aceptación de la siguiente integración
1. PR fuente Claude #83 aprobado en su rama. 2. Incorporar de modo no destructivo sus archivos de Editor al árbol nativo apilado, con commits y conflictos visibles. 3. Ejecutar el build de Claude y guardar un HTML reproducible. 4. Pasar los jobs iOS + Android y los tests de Editor. 5. Ensayar foto/video en teléfono cuando sea posible. Ningún elemento se marca finalizado solo por compilar.