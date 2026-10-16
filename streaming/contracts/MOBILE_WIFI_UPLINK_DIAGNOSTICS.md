# Wivra móvil: ruta Wi-Fi/datos del teléfono antes de LIVE (16 oct 2026)

**Prioridad del propietario: Wivra móvil primero, iPhone y Android.** Wivra Desktop y su puente de cámaras quedan como trabajos futuros; no crear una segunda aplicación.

## Función implementada en este PR

Se observa y presenta la **ruta de red predeterminada del teléfono** dentro de Wivra móvil:

- **iOS:** `WivraPhoneNetworkStatus.swift` usa `NWPathMonitor` para informar tipo de interfaz del sistema (`wifi`, `cellular`, `ethernet`, `other`, sin ruta), Low Data Mode y conexiones que el sistema clasifica como potencialmente costosas. Aparece tanto en la pestaña Ray-Ban como en la del iPhone.
- **Android:** `WivraMetaPreviewActivity.kt` usa `ConnectivityManager.activeNetwork`, `NetworkCapabilities` y un callback del sistema solo mientras la actividad está visible. Muestra Wi-Fi/datos celulares/VPN/Ethernet/otra o desconectado; añade el estado `NET_CAPABILITY_VALIDATED` cuando Android lo confirma. Utiliza únicamente el permiso normal `ACCESS_NETWORK_STATE`; **no** inspecciona SSID, contraseñas, dispositivos cercanos ni historial de navegación.
- **Idioma:** mensajes de ambas plataformas en español, inglés, francés, alemán, italiano y japonés.
- **Pruebas:** contratos de origen y verificación nativa iOS/Android en GitHub Actions. No se requiere Meta DAT real para mostrar el tipo de red del teléfono.

## Dos enlaces diferentes que nunca se deben confundir

```text
Ray-Ban -- Bluetooth Classic o Wi-Fi gestionado por Meta DAT --> Wivra móvil
                                                                  │
Wivra móvil -- Wi-Fi normal del teléfono o datos 4G/5G ----------> Internet/LIVE
```

Que `NWPathMonitor` o Android marque **Wi-Fi** solo describe la ruta de red del **teléfono**. No demuestra que DAT esté usando Wi-Fi, que la red permita enviar video a Twitch, ni que el upload tenga velocidad/capacidad estable. Android `NET_CAPABILITY_VALIDATED` confirma una validación general de red del sistema, **no** una prueba de RTMP o acceso a la plataforma de destino.

Un enlace DAT `wifi-softap` puede desplazar la conexión Wi-Fi normal del iPhone y obligar a datos móviles para subir el LIVE, cuando exista. **No** seleccionar automáticamente datos caros ni cambiar el transporte DAT durante grabación. Un diagnóstico no justifica asumir que la red de las gafas y el teléfono son la misma.

## Seguridad y estado

- No hay medición de velocidad, tráfico real, llamadas a Internet, stream RTMP, elección de transporte de las gafas ni conmutación de red implementados por esta entrega.
- Nunca detener la grabación local por una caída de red hacia Internet si la cámara sigue disponible y es seguro continuar.
- Los permisos de captura y guardado siguen siendo explícitos. El flujo Keep/Delete/Later y editor de Claude no se modifican.
- Requerir pruebas reales con iPhone/Android y gafas para evaluar rutas de conectividad, interferencia, latencia, batería, permisos y actividad en segundo plano.

## Próximas etapas móviles recomendadas

1. Validar las etiquetas de ruta de red frente al Wi-Fi doméstico, 4G/5G y modo avión con dispositivos reales.
2. Integrar diagnósticos de capacidad de **subida real a servidores del usuario** solo bajo acción explícita y con consumo de datos visible, sin almacenar claves.
3. En sesiones DAT reales, identificar el transporte solo cuando un SDK/documentación oficial lo exponga; de lo contrario marcar «gestionado por Meta», sin inventar Bluetooth o Wi-Fi.
4. Si luego hay publicador LIVE, degradar bitrate de salida y conservar copia local, **sin** tratar un cambio del Internet como cambio de enlace de las gafas.
5. Mantener el trabajo de Wivra Desktop Camera Bridge en la issue #109, sin expandirlo ahora.
