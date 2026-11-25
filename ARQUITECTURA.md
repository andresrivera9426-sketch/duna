# DUNA · arquitectura (v3)

```
src/
  app/        main.js (arranque, shell, tiempo real, rutas) · sections.js (registro de pestañas y módulos)
  services/   sb.js (Supabase) · state.js (estado y datos) · crypto.js (E2E) · media.js · native.js (Capacitor)
  shared/     ui.js · people.js (avatares, ticks) · theme.js · reader.js (visor integrado) · stickers.js · gifs.js
  features/
    auth/      auth.js · account.js
    chats/     chat.js · composer.js · bubbles.js · info.js · newchat.js · extras.js
    calls/     calls.js
    ia/        ia-lite.js (siempre cargado: fila fijada, @IA) · ia.js (todo lo demás, bajo demanda)
    discover/  stories.js · communities.js
    settings/  settings.js
```

- **Carga diferida:** `tools/build.mjs` usa code splitting de esbuild. `app.js` + los trozos que arrancan se
  precargan (`modulepreload`); llamadas, IA, ajustes, comunidades, estados, visor, nativo y la conversación
  se descargan al usarse (la conversación se precarga en reposo). `node tools/size-report.mjs` muestra el peso.
- **Super-app:** `registerNav({...})` añade pestañas; `registerModule({ id, label, icon, order, render })` añade
  secciones dentro de *Descubrir* (noticias, videos, radio, juegos, mini-apps) sin tocar el shell.
- **Todo dentro de la app:** `shared/reader.js` intercepta los enlaces externos y los abre en el lector
  (páginas vía la función `ia` modo `read`), reproductor de video/audio, visor de imagen o mapa.
  Nuevos tipos de contenido: `registerViewer(kind, fn)` y `openContent({ kind, ... })`.
- **Pruebas:** `tests/send-stays-open.mjs` (regresión del envío), `tests/ui-v3.mjs`, `tests/ia-e2e.mjs`,
  `tests/ia-api2.mjs` (IA real), `tests/perf.mjs` (rendimiento), `tests/shots.mjs` (capturas).
