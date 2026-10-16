# Wivra: decisión de lenguajes y continuidad mientras Claude no está disponible

Fecha: 15 octubre 2026. Fuente: propietario de Wivra y estado de PR #44, #73, #74, #75, #76.

## Decisión de ingeniería
1. **No reescribir el editor de Claude.** Mantener su código existente de `app/` y `core/` JavaScript ESM como motor compartido para iOS y Android. Reutilizar el HTML generado `app/dist/agentcut.html` y las pruebas actuales; se evita cualquier editor paralelo.
2. **TypeScript progresivo** como dirección para módulos compartidos nuevos cuando exista un proceso de compilación/test que no rompa el bundle HTML existente. No convertir todo JavaScript ahora, ni prometer migración completada.
3. **Swift + SwiftUI en iOS** para cámara del teléfono, SDK DAT de Meta, selección de audio, biblioteca local, permisos y host WKWebView. Mantener el Swift ya implementado.
4. **Java del host Android existente** se mantiene temporalmente porque compila. **Kotlin** es idioma preferido para módulos nativos Android nuevos, sin necesidad de traducir el host Java para hacerlo.
5. **Contratos entre capas**: único esquema de proyecto y de checklist, puente nativo seguro mediante métodos limitados, IDs estables y manifiestos de captura. Sin compartir rutas privadas sin autorización. Sin cuentas ni facturación necesarias.

## Qué está integrado y comprobado
- PR #73: el Director offline reutiliza el checklist de Claude, no crea dos formatos de tomas; CI verde.
- PR #74: app iOS con cámara iPhone, módulo Ray-Ban, biblioteca y el mismo editor de Claude offline. La compilación Xcode sin firma resultó correcta; puente inicial entrega capacidades y metadatos.
- PR #75: shell Android Java/WebView con el mismo editor y packs; CI genera APK debug. No trae aún DAT/cámara Android.
- PR #76: selector iOS de captura local para que el importador existente reciba archivos MOV, CAF y manifiesto. Comprobación Xcode y prueba física de selección pendientes hasta evidencia de CI/dispositivo. No sustituye la importación del editor.

## Cómo trabajar sin Claude y evitar que deba rehacer una revisión
- ChatGPT asume diseño, implementación, pruebas, CI y corrección de sus propios cambios. Claude NO es bloqueo ni condición para continuar.
- Mantener cada cambio en PR pequeño con base y pruebas declaradas. No reescribir la rama de Claude ni main sin aprobación del propietario.
- Cuando Claude regrese, podrá leer PRs y el resumen de pruebas para orientarse, sin obligación de revisar todo el historial como condición de funcionamiento.
- Para publicar una app iPhone hace falta firma y generalmente membresía Apple Developer; CI unsigned no es instalable sin firmar. No activar gastos.
- Tests de código/compilación NO confirman funcionamiento físico de captura, permisos, audio, exportación ni IndexedDB.

## Próximas tareas
1. Verificar que WKOpenPanel entrega los archivos locales de captura al importador actual de la misma app (simulador y iPhone cuando se pueda); reparar códecs/permisos sin duplicar archivos.
2. Verificar guardar/reabrir el proyecto en el WebView del host y exportación con MOV/CAF reales.
3. Aplicar las mismas reglas de catálogo de medios/IDs a Android, integrar cámara/SDK DAT cuando se permita.
4. Solo después: fotos como clips principales, AutoCut y UI de Director/teleprompter y packs originales.
