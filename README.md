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

## Автоплей и video surface

`open()` запускает воспроизведение по умолчанию. Передать `options.autoplay: false`, `playback.isAutoplay: false` или `playback.isAutoplaySettingEnabled: false`, если автозапуск не нужен. Ограничения браузера на звук не обходятся: для автоплея без пользовательского действия может потребоваться `options.muted: true`.

Как и в legacy SDK, основной `<video>` монтируется в отдельный `.html5-video-container`, который вставляется первым элементом в `document.body`. Переданный `InitData.node` не используется как video surface, поэтому скрытый UI-слот `player-ds` остается пустым. Контейнер удаляется при `close()`, `shutdown()` и `destroy()`.

## Локальный запуск

```bash
npm run dev
```

По адресу `http://127.0.0.1:4173` сервер отдает `playerLib` bundle. Тестовая страница доступна по `http://127.0.0.1:4173/demo`. Команда собирает SDK и запускает сервер с MP4, HLS и DASH fixtures. Для повторного запуска без сборки используется `npm run dev:server`. Подробности в `ops/README.md`.

## Интеграция с player-ds

Для `vktv` используется `PLAYER_LIB_URL=http://127.0.0.1:4173`: по этому URL dev server отдает текущий bundle. `player-ds` уже использует document `CustomEvent`, поэтому `onMessage` не требуется. Общие externs остальных сцен не сужаются.

Поддержаны player-ds-specific совместимости: `setQuality(..., null)`, `detail.time` и `detail.serverTime` у `tv-channel-server-time-update`, а также audio tracks `{name, description, value}` и text tracks `{id, name, lang, url, isAuto}`.

## Проверки

```bash
npm test
npm run test:e2e
```

`npm test` запускает typecheck, lint, unit, contract и production builds. Browser E2E использует локальные MP4, HLS и DASH fixtures, поэтому внешняя сеть во время тестов не нужна.

## Ограничения

Проект еще не является production-ready заменой legacy SDK. Не проверены реальные VKCore, live/DVR, production stats/ad endpoints, Chrome 34 и физические Smart TV. Thumbnail-only preview не реализован.
