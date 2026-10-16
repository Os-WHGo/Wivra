# Wivra Desktop Camera Bridge · contrato compartido v1

**Estado: contrato ejecutable, SIN receptor de PC, SIN WebRTC real y SIN dos cámaras móviles simultáneas verificadas.** Funcionalidad futura de Wivra Desktop; no duplicar editor ni reconstruir la aplicación móvil.

Issue maestro: [#109](https://github.com/Os-WHGo/Wivra/issues/109). Audio portable: [PR #107](https://github.com/Os-WHGo/Wivra/pull/107).

## Objetivo

Aprovechar un teléfono con Wivra móvil como **intermediario** para dos fuentes opcionales, visibles y autorizadas:

- `rayban-pov`: fotogramas recibidos desde unas Ray-Ban Meta mediante el SDK DAT del teléfono.
- `phone-camera`: fotogramas de la cámara **física** de ese teléfono mediante el sistema de captura iOS o Android.

Las dos fuentes serían independientes. Wivra Desktop podría combinarlas en escenas (PiP o lado a lado) junto a fuentes **propias del PC** como captura de pantalla/webcam/capturadora, enviar LIVE o preparar clips con el **editor único de Claude**. La separación de música y micrófonos será responsabilidad de la capa de audio independiente, no de este módulo de video.

```text
                      FUTURO (no implementado)
Ray-Ban Meta -> DAT -> Wivra teléfono ─┐
                                        ├── LAN autenticada y cifrada ──► Wivra Desktop
Cámara local -> Camera APIs ────────────┘      (dos video tracks independientes)
                                                                          │
PC webcam/pantalla ───────────────────────────────────────────────────────►│
                                                               escenas + LIVE
                                                               grabación local
                                                               editor Wivra
```

## Código entregado ahora

- `streaming/desktop-camera-bridge.mjs`: plan portátil de fuentes, IDs fijos, propuestas de escenas y **modelo de estados** de emparejamiento y salud de cada fuente. No captura/mezcla/transmite ningún fotograma.
- `streaming/tests/desktop-camera-bridge.test.mjs`: pruebas para ios/android y windows/macos/linux; emparejamiento autorizado, fuente interrumpida sin detener la otra, PiP con dos fuentes, fallback a una sola y negativas de seguridad.
- Ninguna pantalla nueva, ningún botón engañoso «Doble cámara lista», ningún cambio de hardware, editor o `main`.

## Realidad del repositorio al 16-10-2026

- iPhone **sí tiene implementados por separado** `MetaB0Model` (DAT) y `WivraIPhoneCamera` (AVFoundation).
- iPhone **no tiene activación simultánea habilitada**: `WivraMetaB0App.requestCaptureTab` detiene una fuente antes de habilitar la otra, a propósito, para evitar corrupción de grabaciones. La idea de concurrencia móvil es **anterior a este bridge**; no declararla implementada ni reiniciar la aplicación.
- Android **sí recibe** DAT en `WivraMetaPreviewActivity`, pero no tiene incorporada todavía la cámara física como segunda fuente.
- El SDK de Meta está orientado a iOS/Android; la PC **no** obtiene automáticamente acceso a las gafas. El teléfono es un intermediario propuesto, no un supuesto bypass de permisos de Meta.

## Estrategia de conexión futura

**Transporte candidato:** WebRTC dentro de una red local, con dos pistas de video y IDs estables `rayban-pov` / `phone-camera`, preferiblemente teléfono en Wi-Fi del mismo router y PC en Ethernet. Eso es una **hipótesis de implementación**, no una conexión instalada. Estudiar USB cableado por plataforma después de prototipar LAN y medir energía/latencia. Bluetooth puede controlar/parear según adaptadores, pero no asumir ancho de banda para los dos streams.

**Paridad futura:** validar primero la compatibilidad real de DAT + cámara móvil en iPhone y Android. Solo dar capacidad `dualFramesVerified` si un ensayo nativo observó **ambos feeds coexistiendo** y capturó métricas. Si falla, usar fallback una cámara. La API `AVCaptureMultiCamSession` de Apple, que trata varias cámaras propias del teléfono, no es evidencia para la cámara remota DAT.

**Privacidad:** avisar siempre qué cámara está activa, solicitar permisos reales y botones manuales para activar fuentes. Emparejar teléfonos/PC con aprobación en ambos extremos, autenticación de dispositivo y enlace cifrado. No transmitir a servidores externos por defecto ni guardar claves, URL privadas o tokens en los planes serializables.

**Resiliencia:** streams identificados por separado, estado y relojes de captura diferenciados, sincronización medida antes de combinar, colas de frames acotadas; fallar una fuente no debe parar automáticamente la otra ni eliminar grabaciones locales. Un apagado por seguridad térmica o de permisos del sistema sí debe respetarse. Evitar simultaneidad de micrófonos que genere eco.

## Etapas sin iniciar todavía

1. **QA real móvil:** comprobar dos flujos concurrentes con permisos, duración, energía, tasas de frames y límite térmico. Sin concluir «funciona en todos» desde un simulador.
2. **Transporte móvil→Desktop:** WebRTC LAN/USB según evidencia real, cifrado y emparejamiento verificados, latencia y mapeo de timestamps entre relojes.
3. **Receptor Desktop y escena:** cambiar entre feeds y PiP, añadir webcam/screen share; permitir editar material **ya finalizado** sin sobrecargar encoder LIVE.
4. **Audio/archivo/editado:** conectar `streaming/audio-routing.mjs`, pistas originales, recuperación, marcador de highlights, export vertical/cuadrado/horizontal, coordinación con Claude.

### Ejecución de pruebas del contrato

```sh
node --test streaming/tests/desktop-camera-bridge.test.mjs
```

**Una prueba Node verde valida solamente la lógica de estados.** No instala una app PC, no prueba conectividad Meta, Android CameraX, AVFoundation, el cable, la red, la codificación ni un LIVE.
