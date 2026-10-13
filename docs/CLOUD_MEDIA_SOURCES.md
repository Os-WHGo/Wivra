# AgentCut · Fuentes multimedia: teléfono, Google Drive, Google Fotos, álbumes e iCloud
**Estado 2026-10-13:** requisito confirmado por el propietario; **NO implementado** en AgentCut. Investigación y propuesta de adaptadores. — ChatGPT  
**Relación:** [PR #18](https://github.com/Os-WHGo/agentcut/pull/18) (permisos/local), [PR #13](https://github.com/Os-WHGo/agentcut/pull/13) (arquitectura abierta), [PR #12](https://github.com/Os-WHGo/agentcut/pull/12) (LIVE y VOD), [PR #17](https://github.com/Os-WHGo/agentcut/pull/17) (eficiencia). Las prioridades las decide el propietario. **No fusionar a main**.

## 1. Requisito del propietario, sin ambigüedad

El usuario debe poder **conectar y seleccionar** videos desde:
- **Google Drive**, carpetas con video y archivos de nube que ya tiene guardados;
- **Google Fotos** (selección de fotos/videos de biblioteca y álbumes permitidos por Google);
- **Archivos / Fotos en iPhone**, iCloud Drive / Fotos en iCloud mediante mecanismos autorizados;
- **Galerías, carpetas y proveedores de archivos de Android**;
- **Grabaciones locales o VOD propios** de servicios LIVE cuando el proveedor autorice su recuperación, con importación manual como respaldo.

Desde una sola biblioteca de AgentCut se deben poder **indexar, previsualizar, elegir escenas, crear proyecto y editar sin una descarga completa manual previa al teléfono**, **si la fuente y el formato lo permiten**. La app minimiza datos, RAM, caché y espacio. Para exportar de verdad tendrá que leer los fotogramas/audio de calidad elegida, en ocasiones el archivo completo; la nube puede requerir descargas automáticas y no se puede garantizar “cero bytes transferidos”.

**Privacidad:** archivos privados por defecto. Las credenciales de Google/Apple se usan solo por conectores autorizados; no se comparten con Claude, ChatGPT, Meta/Muse ni otros modelos. El contenido de video nunca va a un servidor de IA salvo consentimiento específico del usuario. **La app puede descargar al dispositivo temporalmente para editar**, no replicar a servidores propios. No solicitar permisos a bibliotecas completas si selección puntual sirve.

## 2. Capacidades de fuentes: hechos verificados frente a hipótesis

| Fuente | Qué está verificado (documentación oficial) | No verificado / bloqueos |
| --- | --- | --- |
| **Google Drive** | [files.list / search](https://developers.google.com/workspace/drive/api/guides/search-files) enumera archivos/carpetas con permiso; [files.get alt=media](https://developers.google.com/workspace/drive/api/guides/manage-downloads) sirve bytes de MP4/MOV; header HTTP **Range** permite descargar solo fragmentos de ficheros binarios cuando permitido | Edición aleatoria/streaming directa de **cada contenedor/códec**, Safari con OAuth/CORS, gastos/cuotas, thumbnails, lectura satisfactoria sin caché y autenticación por teléfono. Algunos archivos prohíben descargar (`capabilities.canDownload`) |
| **Google Fotos** | [Photos Picker API](https://developers.google.com/photos/overview/about) deja seleccionar fotos/videos autorizados. [media items](https://developers.google.com/photos/picker/guides/media-items): lista selección, URL base expira a ~60 min, requiere OAuth; miniaturas parametrizables; para video `=dv` proporciona **versión transcodificada de alta calidad** y no garantiza bytes idénticos al master | Una API oficial para rastrear **todos** los álbumes históricos indiscriminadamente no existe en Library API actual; endpoint de fragmentos/range del video Picker **NO verificado**; exportación sin descargar contenido completo **NO verificada**. Refrescar autorización si URL caduca. No etiquetar material Photos como «original 4K» sin verificar |
| **Google Fotos Library API** | [Actualización 2025](https://developers.google.com/photos/support/updates) desde **31-03-2025** eliminó scopes generales para explorar bibliotecas y restringió list/search/albums a contenido creado por la propia app. Para fotos elegidas por el usuario, Picker es la opción | No diseñar exploración permanente de toda la cuenta con scopes retirados, ni eludir términos |
| **iCloud Drive/Archivos en iPhone** | [Apple File Provider](https://developer.apple.com/documentation/FileProvider) permite a proveedores sincronizar documentos remotos y mantener cachés locales; la selección de un documento de Archivos es una ruta legítima para que el sistema gestione descarga/apertura según proveedor | Edición directa de archivo no descargado sin materializar datos, permisos persistentes, acceso en Safari a iCloud Drive por API web pública, garantías de range según File Provider **NO verificados** |
| **Fotos de iPhone + iCloud Photos** | [Apple Photos networkAccessAllowed](https://developer.apple.com/documentation/photos/phassetresourcerequestoptions/isnetworkaccessallowed) indica cuándo descargar desde iCloud un asset solicitado que no está presente localmente | El acceso a biblioteca sin selección/autorización y la lectura remota por partes del original **NO verificados**. **No afirmar «iCloud sin descarga»**: puede bajar el archivo internamente |
| **Android galerías / Docs** | [Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files) ofrece `ACTION_OPEN_DOCUMENT` y selección de archivos con consentimiento | Acceso por debajo (Drive/Photos) depende del proveedor y permisos; streaming/offset seek requieren probar `ContentResolver` en dispositivo y URI concreta |
| **Plataformas de LIVE / VOD** | Algunos servicios permiten descargar o exportar videos propios desde su interfaz o APIs autorizadas según elegibilidad | OAuth/API de descarga directa por cada plataforma y políticas de retención, acceso y calidad **NO verificados globalmente**. No usar scraping privado ni suplantación |

**Licencias/condiciones:** Google Drive API, Google Photos API e interfaces Apple son **servicios/APIs propietarias**, aunque SDKs auxiliares puedan tener licencia abierta. Cumplir condiciones Google, Apple, OAuth, protección de datos, permisos y cuotas; NO describir esos servicios como OSS. Cualquier librería adicional se inventariará con su licencia específica antes de incorporarla.

## 3. Propuesta técnica: biblioteca unificada + conectores por fuente

```
  Fotos / Archivos / iCloud / Google Drive / Google Photos / Android / VOD propios
                 │ consentimientos y autorizaciones
                 ▼
       AgentCut MediaSourceAdapter  [NO IMPLEMENTADO]
      list() · pick() · inspect() · thumbnail()
      readRange() si compatible · openLocal() · release()
                 │
       Local MediaBroker + Asset IDs (PR #18)
       metadata + provenance + provider + revision
       cached chunks/thumbs + quota + eviction LRU
                 │
       vista previa proxy cuando sea posible
       timeline local / agentes de edición / subtítulos
                 │
       exportación progresiva en teléfono
       leyendo datos necesarios sin duplicados persistentes
```

**Contrato candidato, no API existente**:
```json
{
  "assetId": "local-generated-id",
  "source": "phone_files|phone_photos|google_drive|google_photos_picker|icloud_files|android_saf|vod_import",
  "providerFileId": "opaque-reference",
  "providerRevision": "optional",
  "originalResolutionVerified": false,
  "mimeType": "video/mp4",
  "capabilities": {
    "enumerateFolders": false,
    "pickFiles": true,
    "randomRangeRead": "unknown",
    "thumbnail": "unknown",
    "downloadOriginal": "unknown",
    "localCacheAllowed": false,
    "licenseTermsChecked": false
  },
  "authorization": {"scope": "selected_items_only", "expiresAt": null},
  "transfer": {"downloadedBytes": 0, "totalBytes": null, "cachedBytes": 0},
  "localCopy": null
}
```

**No persistir tokens, URL temporal de Google Fotos ni rutas reales privadas dentro del proyecto JSON.** Guardar identificadores *opacos* + versión/revisión y solicitar reconexión cuando expire sesión. Los derechos para usar una fuente no se heredan automáticamente por otro proveedor. Manejar offline: si un video vive solo en la nube y no se ha obtenido una copia local o proxy suficiente, deshabilitar edición/exportación que requiera datos no disponibles; avisarlo.

### Minimizar datos sin promesas imposibles

1. Primero descargar **solo listado, metadatos y thumbnails** (idealmente proporcionados por API, no fotogramas completos).
2. Al abrir un video pedir **segmentos/rangos** si la fuente y el archivo permiten salto temporal real; indexación/moov MP4, fast-start, fragmentación, transcodificación del proveedor y seek no garantizan siempre leer pocos bytes. Google Drive admite `Range` para ficheros binarios, no implica streaming universal de cualquier MP4.
3. Generar proxy **local de baja resolución** bajo demanda solo cuando se han obtenido bytes suficientes; cache con límite en MB configurable; el proxy consume algo de espacio pero acelera trabajo.
4. Analizar de forma incremental. IA local ve solo segmentos autorizados; IA nube ve transcripción/metadatos y, con permiso, muestras adicionales. Todo lo privado puede requerir una descarga local inicial.
5. Exportar **desde la fuente de mayor calidad disponible**, indicando en UI si Google Fotos entregó una transcodificación y no el master. Si falta conexión o el original, permitir proyecto editable pero señalar que la exportación final depende de recuperar datos.
6. Mostrar indicadores **Datos transferidos / Espacio temporal / Tiempo estimado** y evitar duplicar el original ya almacenado en la nube o el teléfono. No borrar el original remoto ni sincronizar modificaciones destructivamente.
7. Si un video de Drive está montado también en Archivos del iPhone, no asegurar igualdad de versiones sin fingerprint/hash o identificador coherente.

## 4. Pruebas mínimas que puede coordinar Claude, sin computadora para el propietario

- **Cloud M0 (Google Drive)**: conectar cuenta con OAuth restringido a lo seleccionado, abrir carpeta de 3 videos, presentar miniaturas + duración, seleccionar un video grande, medir MB transferidos al buscar 10s de preview, introducir un corte, validar exportación final en el iPhone. **Se necesitará una implementación y hosting/configuración OAuth**; no está hecha. Probar que no se sube el video a un servidor propio.
- **Cloud M1 (Google Fotos Picker)**: seleccionar un video y uno o varios álbumes mediante UI oficial, comprobar qué retorna realmente Picker y si `=dv` entrega copia transcodificada; medir descarga y disponibilidad de original.
- **Cloud M2 (Archivos/iCloud)**: elegir video de iCloud no descargado, registrar si el sistema necesita descargarlo y cuánto; luego probar reproducción y edición offline al desconectar internet. No prometer acceso remoto sin datos.
- **Cloud M3 (Android)**: SAF/Photo Picker, seleccionar un video en Drive/galería, examinar permisos y lectura por trozos.
- **Cloud M4 (VOD)**: comparar importación manual de la repetición propia contra API oficial verificada para 1 destino permitido; registrar calidad y expiración.

**Ruta pragmática:** reutilizar el selector actual de PR #5/#18 para usar video de la fototeca/Archivos (incluido un archivo iCloud materializado por el SO), mientras se desarrolla conector Drive. Luego Photos Picker. Esto permite pruebas de teléfono primero, sin reestructurar todo el editor.

### Entregable y estado

**Este documento es especificación e investigación.** No agrega OAuth de Google, no procesa archivos de Drive, no habilita Google Fotos, no cambia los permisos del teléfono y no demuestra exportación directa desde nube. **Claude debe validar el diseño e implementar por separado**, evitando declarar «ya funciona». Mantener PR en borrador. **No hay decisión de fusión a main.**

— ChatGPT
