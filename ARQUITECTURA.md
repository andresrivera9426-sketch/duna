# DUNA · arquitectura (v3 + super-app 1.0.8)

```
src/
  app/        main.js (arranque, shell, tiempo real, rutas) · sections.js (registro de pestañas y módulos)
  services/   sb.js (Supabase) · state.js (estado y datos) · crypto.js (E2E) · media.js · native.js (Capacitor)
  shared/     ui.js · people.js (avatares, ticks) · theme.js · reader.js (visor integrado) · stickers.js · gifs.js
              kit.js (utilidades de Descubrir) · share.js (compartir en un chat) · player.js (radio/audio persistente)
  features/
    auth/      auth.js · account.js
    chats/     chat.js · composer.js · bubbles.js · info.js · newchat.js · extras.js
    calls/     calls.js
    ia/        ia-lite.js (siempre cargado: fila fijada, @IA) · ia.js (todo lo demás, bajo demanda)
    discover/  stories.js (estados) · communities.js
    moments/   moments.js (muro social de 24 h sobre los estados)
    news/      news.js (noticias: categorías, búsqueda, guardadas, compartir, resumen IA)
    videos/    videos.js (feeds de canales públicos, reproductor integrado, ver después)
    radio/     radio.js (Radio Browser, favoritas) → shared/player.js (mini reproductor persistente)
    miniapps/  registry.js (registerMiniApp) · apps/ clima, divisas, calc, qr, notas, festivos, saber, sismos, unidades
    games/     games.js (registerGame, récords, compartir) · g2048, snake, memoria, triqui
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

## Super-app (1.0.8)
- **Descubrir** = Momentos · Estados · Noticias · Videos · Radio · Mini apps · Juegos · Comunidades · DUNA Pay (próximamente, sin dinero real).
  Cada módulo es un trozo propio (`import()` en `app/main.js`); su CSS vive en `web/discover.css`, que se pide solo al abrir Descubrir.
- **Servidor:** `supabase/functions/descubrir` lee RSS públicos (noticias) y feeds de canales (YouTube/Vimeo), los normaliza y los guarda en
  memoria 10 min. Límite por persona en `public.rl_take()` (también lo usa el lector `ia` modo `read`: 20/min, 300/día).
- **Mini apps:** `registerMiniApp({ id, name, desc, emoji, color, load })` y el módulo exporta `mount(ctx)`; se abre en una capa del visor
  (`openContent({ kind: 'app', mount })`). Juegos igual con `registerGame`.
- **Datos en el teléfono, no en Supabase:** noticias guardadas, ver después, emisoras favoritas, notas/recordatorios, récords, ciudades del clima.
- **Android:** `MediaService` (servicio en primer plano `mediaPlayback`) mantiene la radio sonando con la app en segundo plano;
  recordatorios con `@capacitor/local-notifications`.
