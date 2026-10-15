# Wivra: diseño de Dividir por pista de audio

Requisito del propietario: controles de corte individuales para A1, A2, A3 y cualquier pista de audio futura.

## Interfaz
- Cabecera fija de cada pista: nombre A1/A2/A3 y botón pequeño de parlante (audible/silenciado). El silencio afecta reproducción y exportación, y no destruye archivos.
- Seleccionar segmento con toque. Mostrar tijeras **Dividir**, volumen, mover, recortar y botón **Deshacer** siempre accesible.
- Cabezal vertical marca punto exacto. Dividir corta únicamente el segmento seleccionado si cabezal está dentro de él. No corta pistas vecinas. Cuando hay vínculo a un video, ofrecer "solo pista" por defecto o "elementos vinculados" con elección explícita.
- Mostrar waveform real, asas de trim, botón + por pista, zoom de timeline y controles táctiles accesibles. Cada parte se puede mover, recortar, silenciar y ajustar por separado.

## Operación y pruebas
- La UI y el agente IA usan la misma operación validada de corte. Crea dos segmentos con referencia al mismo archivo original, nuevos IDs, tiempos correctos y volumen heredado. No corta físicamente ni modifica el audio original.
- Historial atómico: Deshacer restaura el segmento antes del corte y Rehacer lo reaplica. Guardado y export deben producir el mismo estado que el preview.
- Prueba: video 20s, voz A2 04-13s y música A3 20s. Cabezal 08s; seleccionar A2; Dividir. Solo A2 se convierte en dos segmentos. Mutear A3 no silencia A2. Deshacer vuelve a un segmento A2. En un límite de clip u hueco, Dividir se deshabilita.
- Verificar resultado en iPhone real, incluida persistencia, mezcla y export.
- Claude implementa editor en PR #44 y debe comparar capacidad con motores OpenReel/OpenCut antes de sustituir código. No copiar assets de CapCut. No merge a main.

— ChatGPT
