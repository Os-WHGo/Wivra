# Wivra | Coordinación autónoma Claude + ChatGPT e internacionalización

**Regla vigente del propietario, 15 oct 2026:** solo Claude y ChatGPT desarrollan y se reparten el trabajo. No asignar tareas ni requerir respuestas de terceros; no depender de acceso a Drive ajeno para continuar. La documentación SDK previamente consultada puede permanecer como referencia técnica histórica.

## Responsabilidades y autonomía

| Responsable | Propiedad principal | Instrucción permanente de ejecución |
| --- | --- | --- |
| **Claude** | Editor compartido de Wivra (`app/`, `core/`): timeline, proyectos, importador del editor, filtros, efectos, Director, IA de edición, subtítulos, export | **Implementar → probar → corregir → seguir**. Tomar decisiones técnicas y de UI menores sin preguntar al propietario repetidamente. No esperar aprobaciones frecuentes para acciones normales de desarrollo. |
| **ChatGPT** | Integración nativa iPhone/Android, SDK Ray-Ban Meta, cámara, audio, LIVE, manifiestos de captura, sincronización nativo↔editor, **todas las traducciones e i18n del producto** | Resolver cruces entre ambos equipos, integrar PRs apilados y rama lateral #76 en un árbol seguro, implementar catálogos nativos, mantener paridad de funciones, no reemplazar el editor. |
| **Propietario** | Autorización de merge a main, costos, publicación, privacidad sensible, cambios de alcance | Solo interviene ante decisiones mayores que no se deben presumir autorizadas. |

## Protocolo cuando hay un cruce o bloqueo
1. Claude **no toca** módulos nativos ChatGPT para resolver una colisión. Publica en https://github.com/Os-WHGo/Wivra/issues/49 comentario con prefijo `BLOCKED: ChatGPT`, ruta, rama/PR, archivo, contrato afectado, reproducción, recomendación y evidencia CI.
2. **ChatGPT decide y realiza la integración** de los cruces dentro del alcance autorizado, sin redirigir la decisión al propietario por rutina.
3. Mientras tanto Claude **continúa con otra tarea independiente del editor**. No se bloquea esperando aprobación o respuesta de ChatGPT.
4. Para bugs normales, Claude elige solución conservadora compatible, añade regresiones y continúa. ChatGPT aplica la misma autonomía en su área.
5. Los entregables intermedios no precisan revisión cruzada salvo interfaz compartida/compatibilidad de datos. En interfaces de ambos, documentar contrato y probar cambios antes de declararlos integrados.

## Solo preguntar al propietario para
- Fusionar a `main`, publicar/distribuir build, aceptar licencias nuevas restrictivas, cambiar nombre/licencia/dirección central del producto.
- Gastos no aprobados, suscripciones, claves API, servicios externos obligatorios o almacenar datos privados en nubes.
- Riesgos de seguridad/privacidad significativos, pérdidas de datos, cambios destructivos, reescritura de historial o requerimientos legales relevantes.
- Contradicciones reales con decisiones explícitas de producto para las que no exista una opción conservadora.

**Límites permanentes:** no forzar push o pushes de clones anteriores a limpieza Git del 15-oct-2026 a las 10:04 Vancouver; no fusionar `main` sin autorización; no fingir pruebas físicas o funcionalidad no implementada; no crear un segundo editor. Hacer PR pequeños, documentar evidencia; no pedir autorización por cada commit.

## Estado de integración comprobado en GitHub
- [PR #44](https://github.com/Os-WHGo/Wivra/pull/44) Editor Claude abierto en draft, no fusionado a main.
- Cadena [#73](https://github.com/Os-WHGo/Wivra/pull/73) → [#74](https://github.com/Os-WHGo/Wivra/pull/74) → [#75](https://github.com/Os-WHGo/Wivra/pull/75) → [#77](https://github.com/Os-WHGo/Wivra/pull/77) → [#78](https://github.com/Os-WHGo/Wivra/pull/78) → [#79](https://github.com/Os-WHGo/Wivra/pull/79) → [#80](https://github.com/Os-WHGo/Wivra/pull/80). Código incorporado en branches apiladas; merges de estos PR todavía pendientes.
- [PR #76](https://github.com/Os-WHGo/Wivra/pull/76) es rama lateral de importación iPhone que ChatGPT integrará cuidadosamente con la cadena principal.

## Internacionalización asumida por ChatGPT
- **Editor Claude existente:** `app/i18n.mjs` reconoce `es`, `en`, `pt`, `fr`, `de`, `ja`, `zh`, `it`. No borrar idiomas ni sustituir catálogo del editor por otro al integrar.
- **Interfaz nativa Android:** 31 cadenas de la pantalla Ray-Ban en `es`, `en`, `fr`, `de`, `it`, `ja`, guardadas como Android resources y verificadas por tests. Todavía no significa que TODAS las pantallas de Wivra estén traducidas.
- **Plan LIVE #65:** propone seis locales P0 y pt-BR/id para expansión; su plan de subtítulos de 20 destinos NO es equivalente a 20 traducciones UI terminadas.
- ChatGPT mantiene términos, placeholders, pluralización/accesibilidad y paridad nativa Android/iOS. Coordinará el selector nativo y el idioma guardado del editor **sin invadir sus operaciones funcionales**.
- Claude se concentra en UI funcional del editor, no en producir traducciones nuevas. Cuando agregue texto nuevo debe identificar claves sin traducir; ChatGPT las localizará.

## Próximos hitos
**Claude:** robustecer persistencia y exportación, fotos como clips y temporalidad, bugs del timeline y Director, pruebas de editor. Definir solo interfaz de medios que necesite pedir a ChatGPT mediante nota de bloqueo. **No esperar** la respuesta de ChatGPT para otras tareas.
**ChatGPT:** incorporar #76 a la integración real sin perder cambios, continuar pantalla nativa iOS/Android y traducciones, QA de contratos del importador, cámara/micrófonos/LIVE.

**Coordinación y bloqueos exclusivamente en issue #49. No exigir reportes de terceros.**