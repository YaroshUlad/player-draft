# VK Player Engine

Adapter для `window.VKCore.Player`. Используется как fallback для DASH после Shaka.

## Entry points

- `src/vk-player.ts` — VK globals, initialization и типы.
- `src/vk-player-adapter.ts` — adapter и factory.

## Поведение

- `initVideo/prepare/play/pause/seek/seekLive/stop/destroy`.
- DASH variant mapping и failover hosts.
- Quality/auto-quality, audio, subtitles, playback rate и volume.
- First bytes/frame, buffering, timeupdate и fatal errors.
- Live seek с отрицательным offset; `seekLive(0)` возвращает в эфир.

Autoplay выполняется только core: скрытый `play()` внутри `prepare` не вызывается.

## Ограничения

Проверка выполнена на fake VK SDK. Настоящий `VKCore`, production config, restrictions и встроенный OneStat еще не проверены.

## Проверки

- `tests/unit/vk-player-adapter.test.ts`
- `tests/contract/stats-extension.test.ts` — отсутствие дублирующего SDK OneStat на VK path.
