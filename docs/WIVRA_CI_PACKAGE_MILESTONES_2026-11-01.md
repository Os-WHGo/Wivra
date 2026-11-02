# Wivra · Política de compilación frente a instalables (MU P0-X, 01-11-2026)

## Decisión operativa del propietario

No producir un APK ni IPA por cada macrobloque. Mantener **pruebas de código por PR y compilación de comprobación solo cuando cambie nativo**, y reservar APK/IPA/instrumentación/emulador completo para una candidata de beta instalable. Esto reduce tiempo/carga GitHub Actions y evita atribuirle al usuario una instalación que no tiene todavía. Objetivo 19-11-2026 sigue siendo meta, no promesa de QA física.

## Antes y después

| Flujo | Antes | P0-X, propuesto en PR |
|---|---|---|
| App Tests + Director + LIVE Preflight | Pruebas en cambios relevantes | **Igual**: rápidas, conservan contratos |
| Wivra Unified Android Native Build | Prueba + `assembleFullDebug`, `assembleCaptureDebug`, instrumentation APK y subida de dos APK en cada PR | Kotlin/Java compilados para FULL y CAPTURE + unit tests; **no** genera APK, no instrumentos ni upload; PR solo cuando `streaming/android/**` cambia |
| Meta B0 iOS Native Build | Compilación simulador y dispositivo + empaquetado/subida IPA unsigned en cada PR de nativo/editor/core | Mantiene Xcode simulator y arm64 unsigned source compile y assets; **no** produce ZIP/IPA; PR solo cuando `streaming/ios/B0/**` cambia |
| Wivra Complete Beta Assembly (Mobile) | PR automáticamente ejecutaba contratos, compilaba APK y IPA, y arrancaba emulador | Contratos por PR **sí**; trabajos APK/IPA/emulador solo por marcador explícito `wivra-package-beta` o `workflow_dispatch`, sin merge ni firma |

## Cómo pedir la beta cuando esté completa

La PR de la versión consolidada que se vaya a instalar recibirá la **etiqueta `wivra-package-beta`**; el evento `pull_request.labeled` ejecuta el flujo completo sobre ese commit, luego se revisan hashes y resultados de APK/IPA. El desarrollador puede crear esa etiqueta en GitHub si aún no existe. La condición exige exactamente el evento **`labeled`** con esa etiqueta: los commits posteriores no provocan paquetes adicionales aunque la etiqueta continúe aplicada. Para construir otra candidata, retirar y volver a aplicar la etiqueta sobre la PR congelada.

`workflow_dispatch` se conserva como salida manual si el workflow llega a existir en la rama principal: **GitHub exige que el workflow exista en la rama default para dispararlo desde el botón**, y estos workflows todavía no están en `main`; por ahora la etiqueta PR es la opción operativa. No fusionar `main` solo para obtener el botón. Consulta oficial: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow

**Advertencia técnica:** compilar clases Android/iOS en CI puede crear carpetas intermedias o un `.app` de Xcode, pero no genera ni sube APK/IPA. Compilación sigue siendo esencial para detectar errores de SDK/Swift/Kotlin sin esperar a la beta final. Tests Node sobre editor JS no requieren compilaciones móviles en cada commit.

**Criterios de cierre:** `app/tests/beta-milestone-package-gate.test.mjs` impide reactivar ensamblado accidental en flujos ordinarios; PR P0-X pasa App Tests, pruebas de contratos, y simulación sin marcador confirma los trabajos de empaquetado omitidos. Ante etiqueta explícita, full assembly incluye APK Android FULL, APK opcional WivraCapture, APK de instrumentación, IPA unsigned, sumas SHA-256, WebView y pruebas en emulador. La IPA sin firma **no** es instalable en iPhone, y una APK de depuración no demuestra grabación real Ray-Ban/RTMP. Las pruebas físicas se ejecutan juntas según autorización del propietario.

## Reversibilidad

Modificar solo tres workflows + test/documentación en PR apilada; no instalar software, no borrar artefactos anteriores, no tocar archivos de usuario ni activar publicidad/pagos. Revertir PR o revertir commits restablece el esquema previo. Confirmar que los status checks obligatorios de repositorio no dependan de trabajos marcados como skipped antes de fusionar `main`.
