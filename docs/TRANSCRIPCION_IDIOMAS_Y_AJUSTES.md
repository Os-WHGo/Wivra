# Transcripción, traducción, idiomas de la app y panel de Ajustes

> **Propuesta de Claude, 15 oct 2026.** Candidatos y diseño, no decisiones: decide el propietario. **[V]** = leído en la página oficial ese día; **[NV]** = no verificado. No es consejo legal. Nada de esto está implementado.

## 1. Transcripción (voz → texto con tiempos)

| Opción | Idiomas | Tamaño | Licencia | Notas |
| --- | --- | --- | --- | --- |
| **Whisper** (OpenAI) con transformers.js, en el navegador | 99 idiomas, pero «fuerte» en unos 10 [V] | tiny ~120 MB, base ~210 MB, small ~590 MB [V, de un artículo de terceros] · large-v3-turbo 0,8 B parámetros [V] (peso en MB: [NV]) | **MIT** [V] | Da tiempos por frase y **por palabra** [V] (sirve para subtítulos con palabra resaltada). Puede inventar texto que no se dijo y es peor en idiomas con pocos datos [V]. No es de tiempo real «de fábrica» [V] |
| Whisper en la nube (con tu clave) | igual | no pesa en el teléfono | según proveedor [NV] | Sube el audio a un tercero: avisar siempre |
| Reconocimiento del propio iPhone/Safari | [NV] | — | — | No pude verificar su soporte ni si envía audio a Apple. Pendiente de prueba |

**Velocidad en iPhone: sin medir.** Un artículo da 10–15× tiempo real para tiny y 2–4× para small con WebGPU [V], pero dice que Safari no tiene WebGPU; en `VERIFICATION.md` ya está **contradicho** (soportado en iOS 26+). Hay que medir en tu iPhone con 1 minuto de audio.

## 2. Traducción automática a muchos idiomas

**Importante:** Whisper solo traduce **al inglés** [V]. Para otros idiomas hace falta otro paso.

| Opción | Idiomas | Tamaño | Licencia | ¿Sirve en iPhone? |
| --- | --- | --- | --- | --- |
| **IA en la nube con tu clave** (la misma conexión del chat de IA) | muchísimos | 0 | según proveedor | **Sí, la más simple y de mejor calidad.** Envía el texto (no el video) a un tercero: avisar |
| **Opus-MT** (Helsinki-NLP) | un modelo por par de idiomas (1 500+) [V] | ~300 MB por dirección [V] | **CC-BY 4.0** (se puede usar comercialmente con crédito) [V] | Posible pero pesado: un par = 300 MB descargados |
| **MADLAD-400** (Google) | 400+ [V] | 3B: 11,8 GB; cuantizado 1,65 GB [V] | **Apache-2.0** [V] | No para teléfono (calidad baja al cuantizar, sin evaluar en producción [V]) |
| **NLLB-200** (Meta) | 200+ | 2,5 GB el más chico [V] | **CC-BY-NC: NO comercial** [V] | **Descartado** si Wivra puede ser comercial |
| Traductor integrado de Chrome | pares por descarga | — | — | **No: solo escritorio, «no funciona en móviles»** [V] |

**Recomendación:** transcribir en el dispositivo (Whisper, opción tuya) y traducir con la **IA de tu clave**; el modo sin conexión con Opus-MT sería un extra opcional por idioma. Antes de ofrecer cualquier modelo: verificar su licencia exacta y poner el crédito en la app.

## 3. App en varios idiomas (primera vez)

**Hoy:** todo el texto está escrito directamente en español dentro de la página (`<html lang="es">`, ~220 líneas con textos).

**Diseño propuesto:**
1. Un diccionario por idioma (`es`, `en`, luego `pt`, `fr`, …) y una función `t('clave')`. El español es la base; si falta una frase, se muestra en español (nunca vacío).
2. **Primera vez que se abre:** una pantalla simple «Elige tu idioma» (con el idioma del teléfono marcado de antemano). Se guarda en el teléfono (`wivra.lang`). También se puede cambiar después en Ajustes.
3. Cada frase nueva de la app se escribe ya con su clave (regla para ChatGPT y para mí).
4. Las traducciones iniciales las hace una IA y **una persona que hable el idioma las revisa** antes de publicarlas.
5. Lo que la IA ve (operaciones) **no se traduce**: siguen siendo los mismos nombres.

**Costo:** pasar los textos actuales a claves es trabajo grande pero mecánico (por pantallas). Sugiero empezar por **español + inglés**.

## 4. Panel de Ajustes (lo que no debe estar en la pantalla principal)

Un botón de engranaje en Inicio (y no en el editor) que abre una hoja con secciones:
- **Idioma** de la app.
- **Pantalla:** el actual «Ajustar pantalla» (sale de la portada).
- **IA:** proveedor, dirección, modelo, tu clave (solo en memoria; nunca en el repo), qué se envía.
- **Transcripción y traducción:** modelo (tiny/base/small o nube), idioma del audio («detectar»), idioma de destino, descargas hechas y botón para borrarlas.
- **Privacidad:** el video no sale del teléfono por defecto; interruptores para envíos opcionales.
- **Datos:** espacio usado, borrar paquetes de efectos descargados, borrar proyectos.
- **Acerca de:** versión, licencias y créditos (obligatorio por CC-BY y MIT).
- **Avanzado** (oculto): opciones de prueba.

Todo se guarda solo en el teléfono (`localStorage`), sin claves en el repositorio.

— Claude
