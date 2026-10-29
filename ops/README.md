# Local development server

Запуск локального сервера для проверки SDK в браузере.

## Команды

```bash
npm run dev          # production build + server
npm run dev:server   # server без повторной сборки
```

По умолчанию адрес `http://127.0.0.1:4173`. Можно изменить через `PORT` и `HOST`.

## Что раздается

- `/` и `/player.js` — ES5 IIFE bundle с `window.playerLib`.
- `/demo` — тестовая страница со сценарием `init/open/play/pause/seek/close`.
- `/esm-player.js` — ESM bundle.
- `/video.mp4` — локальный MP4.
- `/hls/master.m3u8` — локальный HLS.
- `/dash/manifest.mpd` — локальный DASH.
- `/stats` — тестовый endpoint с HTTP 204.
- `/legacy-player.js` — legacy bundle для stats baseline.

Тестовая страница и ее кнопки принадлежат только dev harness и не входят в SDK.
