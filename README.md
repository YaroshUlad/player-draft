# VKTV Player Draft

Headless Smart TV player SDK на TypeScript. Проект создается отдельно от legacy `one-smart-tv-player-js-sdk` и не использует его как runtime-зависимость.

## Принципы

- `PlaybackCore` отвечает только за воспроизведение.
- UI отсутствует: controls, scenes, widgets, popups, CSS и subtitle DOM не создаются.
- Наружу передаются только playback API и типизированные `CustomEvent`.
- `MsgChannel`, `MsgType`, `onMessage` и UI-методы отсутствуют.
- Дополнительные функции подключаются через extensions.
- Shaka — основной engine для DASH и HLS, остальные движки — fallback.

## Структура

| Модуль | Назначение |
|---|---|
| `packages/contracts` | Публичные и внутренние TypeScript-контракты |
| `packages/core` | Playback session, state machine, source selection и adapters API |
| `packages/sdk` | `window.playerLib`, facade, ExtensionHost, CustomEvent и preview |
| `packages/engines/native` | Native HTML5 playback и capabilities detection |
| `packages/engines/vk` | VK Player adapter |
| `packages/engines/hls` | HLS.js adapter |
| `packages/engines/shaka` | Shaka adapter для DASH и HLS |
| `packages/infrastructure/http` | Fetch и неблокирующий XHR transports |
| `packages/extensions/stats` | Статистика, serializers и persistent outbox |
| `packages/extensions/ads` | Pre/mid/postroll и рекламные sessions |
| `packages/extensions/playlist` | Playlist и loop lifecycle |
| `packages/extensions/recovery` | Initial/runtime source fallback |
| `packages/extensions/live` | Live pause, rewind и status monitoring |
| `packages/extensions/subtitles` | VTT и headless subtitle events |
| `packages/extensions/tv-channel` | Programme, SCTE-35 и Vitrina events |
| `packages/testing` | Fake adapters, fixtures и stats comparator |

## Entry points

- `packages/sdk/src/global.ts` — IIFE global `window.playerLib`.
- `packages/sdk/src/index.ts` — typed ESM entry.
- `dist/tv/player.js` — ES5 IIFE bundle.
- `dist/esm/player.js` — ESM bundle.
- `dist/types/` — TypeScript declarations.

## Engine priority

- DASH: Shaka → VK Player → native.
- HLS: Shaka → hls.js → native.

Shaka настроен с `bufferingGoal: 10`, `bufferBehind: 2`, `rebufferingGoal: 2`. После seek буфер очищается через variant switch с `clearBuffer=true, safeMargin=0`, на destroy вызывается `unload(false)`.

## Локальный запуск

```bash
npm run dev
```

По адресу `http://127.0.0.1:4173` сервер отдает `playerLib` bundle. Тестовая страница доступна по `http://127.0.0.1:4173/demo`. Команда собирает SDK и запускает сервер с MP4, HLS и DASH fixtures. Для повторного запуска без сборки используется `npm run dev:server`. Подробности в `ops/README.md`.

## Проверки

```bash
npm test
npm run test:e2e
```

`npm test` запускает typecheck, lint, unit, contract и production builds. Browser E2E использует локальные MP4, HLS и DASH fixtures, поэтому внешняя сеть во время тестов не нужна.

## Ограничения

Проект еще не является production-ready заменой legacy SDK. Не проверены реальные VKCore, live/DVR, production stats/ad endpoints, Chrome 34 и физические Smart TV. Thumbnail-only preview не реализован.
