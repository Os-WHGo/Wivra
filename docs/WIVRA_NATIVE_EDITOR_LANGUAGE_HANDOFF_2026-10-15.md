# Wivra: inicio del editor con idioma nativo, sin alterar la preferencia del usuario

Fecha: 2026-10-15. Alcance: iOS host del editor Claude. Esta función no traduce nuevos textos ni modifica `app/` o `core/`.

## Contrato de idioma existente
- El editor original de Claude guarda la elección manual en `localStorage['wivra.lang']` y aplica `i18nApply()`. Su catálogo existente incluye `es,en,pt,fr,de,ja,zh,it`. El editor conserva el control de ese ajuste.
- La app nativa iOS incluye catálogos completos de sus primeras pantallas en `es,en,fr,de,it,ja` mediante los recursos iOS. Son seis idiomas de UI nativa **actualmente compilados**, no una limitación del editor a seis idiomas.
- El primer inicio de `agentcut.html` desde WebKit carga un `WKUserScript` al inicio del documento. Solo para ese archivo exacto y si `wivra.lang` **no existe**, guarda el idioma de `Bundle.main.preferredLocalizations.first`. Ninguna elección existente se sobrescribe, incluyendo `pt` y `zh` del editor.
- Si el idioma nativo no figura entre los seis disponibles, se usa `en`. Si el sistema impide `localStorage` bajo `file://`, la operación falla de forma silenciosa y el editor mantiene su selector original.

## Límites
- Es una **semilla de primera ejecución, no sincronización bidireccional**: si el usuario cambia el idioma dentro del editor, respeta ese idioma en posteriores aperturas. Si luego cambia el idioma del teléfono, no se impone sobre una elección manual o guardada.
- Android mantiene por ahora idioma nativo según configuración del sistema y selector del editor independiente. Una sincronización Android similar necesita comprobar origen de almacenamiento WebView y test de importación/persistencia para no perder datos.
- No se exportan preferencias ni archivos a red o a servicios pagos; no se toca el bundle del editor ni se inyecta un diccionario diferente.
- Las pruebas Node ejercitan las decisiones de almacenamiento y no sustituyen ensayos reales con WKWebView/IndexedDB en iPhone. CI compila simulador y arm64 sin firma.

## Cómo verificar en un dispositivo
1. Primera instalación sin `wivra.lang` guardado: abrir editor y verificar que aparece traducido al idioma nativo compatible sin mostrar selector inicial.
2. Desde ajustes del editor seleccionar `pt` o `zh` y cerrar/reabrir: debe conservarse aunque la app nativa esté en francés o inglés.
3. Reabrir después de usar la biblioteca de capturas y el selector: la preferencia permanece y no se reinicia el proyecto.
4. Simular desactivación de almacenamiento local: el editor debe seguir abriendo y ofrecer selector, sin crashes.

Coordinación: Claude sigue dueño del editor y catálogos internos; ChatGPT del host nativo, traducciones y contrato de integración. Issue #49.