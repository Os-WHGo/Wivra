# Wivra · Política de producto 100 % gratuita

**Instrucción del propietario · 2026-10-16 · Registrada por ChatGPT**

## Experiencia para usuarios
- Wivra debe ser **100 % gratuita para todos los usuarios**. No separar funciones en plan free/pro/premium, no cobrar por cámara, grabación, edición, subtítulos, efectos, voz sintética, exportación o Reel automático.
- **Sin créditos/tokens de pago internos**, saldos de generación, suscripciones, publicidad obligatoria, marcas de agua artificiales removibles mediante pago, límites de uso artificiales que se desbloquean pagando, ni compras integradas.
- El diseño y la funcionalidad básica deben seguir funcionando **sin conexión a servicios pagados**, con procesamiento local donde sea viable y sin subir contenido de manera silenciosa.
- Investigar software y modelos abiertos con licencias compatibles para las funciones nuevas, sin descargar automáticamente componentes grandes, activar servicios externos, recopilar biometría de voz o introducir paywalls.
- Una función futura que **solo** pueda ejecutarse pagando un tercero **no cumple automáticamente esta política**: investigarla y reportar el bloqueo. No pasar el gasto al usuario sin una nueva decisión explícita del propietario.
- Nadie debe prometer que el alojamiento, desarrollo, distribución App Store/Play Store o hardware tienen costo cero: **gratuidad para el usuario no equivale a cero costos operativos**. Cualquier costo inevitable se presenta aparte al propietario antes de contratarse; no se integra como cargo al usuario.

## Alcance de ingeniería y trazabilidad
- Claude mantiene **un único editor** y trabaja en app/core; ChatGPT mantiene captura nativa iOS/Android, conectividad, Ray-Ban Meta, audio y LIVE. Cambios a contratos comunes se coordinan en [issue #49](https://github.com/Os-WHGo/Wivra/issues/49).
- Las skills son **herramientas de desarrollo**, no funcionalidades pagadas para usuarios. Cada script, paquete o modelo externo debe revisarse: licencia, código, telemetría, credenciales, dependencias y costes. Descubrir en skills.sh no autoriza instalarlas.
- Referencia del video aportado por el propietario: [find-skills de vercel-labs/skills](https://github.com/vercel-labs/skills/tree/main/skills/find-skills), repositorio MIT; su uso es para buscar skills, **no** una dependencia de runtime del móvil. Se dejó a Claude evaluación futura sin instalación global automática.
- La idea «Mi voz» para narrar Reels automáticos sigue pospuesta en [issue #117](https://github.com/Os-WHGo/Wivra/issues/117); VoiceStudio [PR #116](https://github.com/Os-WHGo/Wivra/pull/116) permanece cerrado y sin fusionar, no cumple la dirección local elegida.

Este documento es una **regla de producto del propietario** y una guía para desarrollo; no afirma que todas las funciones de IA compleja ya estén técnicamente implementadas ni que su costo computacional sea cero.

— ChatGPT
