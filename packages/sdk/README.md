# SDK Facade

Compatibility facade и composition root headless SDK.

## Entry points

- `src/global.ts` — создает `window.playerLib` для IIFE.
- `src/index.ts` — typed ESM API.
- `src/player-lib.ts` — реализация `IPlayerLib`.
- `src/create-player.ts` — фабрика с dependency injection.
- `src/create-default-core.ts` — engine registry и приоритеты.

## Состав

- `extension-host.ts` — `beforeOpen`, `aroundOpen`, lifecycle и veto для outbound events.
- `custom-event-dispatcher.ts` — единственный внешний событийный канал.
- `custom-event-bridge.ts` — преобразование core events в `CustomEvent`.
- `public-playback.ts` — playback methods, state info и `skipAdv`.
- `preview-service.ts` — trailer preview с loop/stop lifecycle.

## Engine priority

- DASH: Shaka → VK Player → native.
- HLS: Shaka → native.

## Lifecycle

`init → beforeOpen → aroundOpen → playback session → extensions shutdown → core destroy`. Stats и orchestration extensions завершаются до уничтожения core session. UI и `MsgChannel` не создаются.

`open()` всегда запускает воспроизведение после подготовки контента; публичные autoplay/replay флаги отсутствуют. Video surface создается отдельно от `InitData.node`: `.html5-video-container` вставляется первым элементом в `document.body` и удаляется при shutdown.

## Проверки

- `tests/contract/player-lib.test.ts`
- `tests/contract/subtitles-preview.test.ts`
- Browser E2E в `tests/e2e/native-playback.spec.ts`.
