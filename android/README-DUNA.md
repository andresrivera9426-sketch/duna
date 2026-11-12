# DUNA para Android / iPhone (Capacitor 8)

La app nativa empaqueta la misma web de `docs/` (copiada al APK, no carga la URL pública) y añade:
icono/splash/nombre propios (`co.duna.app`), barra de estado, teclado, botón atrás, permisos
(cámara, micrófono, notificaciones, archivos, ubicación), **Compartir con DUNA** desde otras apps
y **notificaciones nativas con la app cerrada**.

## Notificaciones nativas
`supabase/functions/push` (disparada por la base de datos) atiende a la vez Web Push y a los
dispositivos de `public.native_devices` (RLS: cada usuario solo ve los suyos). Por cada dispositivo:

1. Cifra el aviso con la clave AES-256 propia del teléfono (generada en el teléfono).
2. Lo guarda en `private.native_queue` (2 días) para recuperarlo si el teléfono estuvo sin red.
3. **FCM (vía principal, cuando exista el proyecto Firebase):** mensaje *data* de prioridad alta, cifrado.
4. **Respaldo sin terceros:** broadcast de Supabase Realtime a un topic secreto; el teléfono lo recibe con
   `PushService` (servicio en primer plano + websocket). Se usa solo si el teléfono no tiene token FCM.

En los chats 1:1 el texto sigue cifrado de extremo a extremo: el teléfono guarda (envueltas con el
Android Keystore) las claves de sus chats para mostrar la vista previa.

### Activar FCM (gratis, plan Spark)
1. Proyecto Firebase con una app Android `co.duna.app` → descargar `google-services.json`
   → copiarlo a `android/app/google-services.json` (está en `.gitignore`) y recompilar.
   El build detecta el archivo (`BuildConfig.HAS_FCM`) y aplica el plugin de Google Services.
2. Cuenta de servicio (Firebase → Configuración → Cuentas de servicio → Generar clave privada).
   Guardarla SOLO en el servidor:
   `insert into private.app_config(k, v) values ('fcm_sa', '<json completo>') on conflict (k) do update set v = excluded.v;`
   Nunca en el repo ni en el cliente.

## Compilar
```bash
source /workspace/tools/env.sh            # JDK 21 + Android SDK
node tools/build.mjs && npx cap sync android
cd android && ./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
```
La firma de lanzamiento se lee de `/workspace/duna-secrets-local/android/signing.properties`
(o de la ruta en `DUNA_SIGNING_PROPERTIES`). El almacén `duna-release.jks` vive en esa carpeta,
fuera del repo, con permisos 600. **Si se pierde, no se podrán publicar actualizaciones con la misma firma**:
guarda una copia en un lugar seguro.

Iconos y splash: `node tools/mk-assets.mjs && npx capacitor-assets generate --android --ios`.

## iPhone
`ios/` contiene el proyecto Xcode generado por Capacitor (permisos en `Info.plist`). Compilarlo
requiere macOS + Xcode; las notificaciones remotas nativas (APNs) requieren el Apple Developer Program.
Mientras tanto, en iPhone funciona la web instalada en la pantalla de inicio con Web Push (iOS 16.4+).
