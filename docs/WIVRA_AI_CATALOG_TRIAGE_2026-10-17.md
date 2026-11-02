# Wivra | Evaluación del catálogo de IA de Proyecto Cero
**Fecha de revisión:** 2026-10-17  
**Origen:** repositorio privado `Os-WHGo/Proyecto-Cero`, rama `chatgpt/catalogo-ia-open-source-20261017`, commit `5afcefe5de7a710c47cc950a5b2aa10068eff890`.  
**Fuentes documentales:** `catalogo/INVENTARIO_REPOSITORIOS_Y_MODELOS.tsv`, `catalogo/ESTRATEGIA_IA_LOCAL.md`, `catalogo/PROTOCOLO_HALLAZGOS.md`.

## Clasificación para Wivra
| Candidato externo | Funciones ya acordadas a las que podría apoyar | Estado hoy | Barrera de adopción |
| --- | --- | --- | --- |
| whisper.cpp (MIT declarado) | Subtítulos y transcripción local de pista independiente | **CANDIDATO, NO INTEGRADO** | Evaluar modelo y pesos concretos, español/idiomas, precisión, batería, CPU/RAM, almacenamiento, offline y licencia |
| llama.cpp (MIT declarado) | Director creativo y ayuda IA textual | **CANDIDATO, NO INTEGRADO** | Seguridad de las instrucciones, latencia y tamaño del modelo; no subir clips privados |
| ExecuTorch (BSD-3-Clause declarado) | Runtime de inferencia nativo en iPhone/Android | **CANDIDATO, NO INTEGRADO** | Compatibilidad específica con iOS/Android, binarios, versiones, dispositivos, modelos, costes térmicos |
| Qwen3.5-0.8B / Qwen3.5-2B (Apache-2.0 declarado en catálogo) | Borradores creativos, sugerencias textuales | **MODELO CANDIDATO, NO INSTALADO** | Confirmar pesos, versión, licencia efectiva, cuantización y benchmark español |
| Ollama (MIT declarado) | Backend opcional de inferencia | **NO ADOPTAR PARA BETA MÓVIL** | Requiere servidor, aislamiento y costes; no mezclar cuentas ni datos de distintos productos |

## Decisión del ciclo beta actual
- **No integrar ninguno de estos motores ni descargar modelos ahora.** Funciones ya existentes de Director, subtítulos, captura, editor y exportación se terminan y prueban primero.
- No confundir un inventario de bibliotecas de terceros con librerías propias implementadas ni con una biblioteca AI funcional en Wivra.
- Si una integración posterior se aprueba, crear contrato por producto, fijar versiones/checksums, auditar licencias y dependencias, y medir latencia/RAM/temperatura/energía en un iPhone y un Android físicos representativos, antes de llamarla compatible.
- Proyecto Cero es el coordinador de catálogo y organización documental. Este archivo registra solo el análisis del **proyecto Wivra** y no mueve documentación de Drive ni altera otros repositorios.
