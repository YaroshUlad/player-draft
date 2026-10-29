# Playlist Extension

Жизненный цикл элементов playlist и loop policy.

## Entry point

`src/playlist-extension.ts` получает `open` callback и `CustomEventDispatcher`.

## Поведение

- Сохраняет текущий item и playback options.
- При `loop: true` подавляет `event-video-ended` предыдущего элемента и открывает новую session с autoplay и позицией `0`.
- Отменяет запланированный reopen после shutdown.
- Обычный `event-video-ended` не подавляется.

Veto останавливает событие только для outbound bridge; Stats получает `ended` до Playlist.

## Проверки

- `tests/contract/playlist-recovery.test.ts`
- `tests/contract/ads-extension.test.ts` — postroll ordering.

Autoplay-next, рекомендации и восстановление настроек между элементами пока не реализованы.
