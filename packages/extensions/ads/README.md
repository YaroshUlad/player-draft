# Advertisement Extension

Рекламная orchestration отдельно от playback core.

## Entry points

- `src/ads-extension.ts` — roll state machine, skip и resume.
- `src/index.ts` — package exports.

## Поведение

- Preroll открывается до контента, midroll — по позиции, postroll — до `event-video-ended`.
- Каждая реклама — отдельная session с `playbackKind: advertisement`.
- Позиция контента сохраняется и восстанавливается после рекламы.
- `skipAdv()` учитывает `allowSkip` и `skipAfterMs`.
- Ошибка рекламы не блокирует контент.
- Рекламный `ended` не маскируется под завершение контента.

## События

`player-advertisement-start`, `player-advertisement-started-playing`, `player-advertisement-end`, `player-advertisement-error` и `ads_playback` через `prod-stat-event`.

`playMidrollFromTv()` используется для SCTE-35 midroll из `TvChannelExtension`.

## Проверки

- `tests/contract/ads-extension.test.ts`
- `tests/contract/ads-stats.test.ts`
- `tests/contract/tv-channel.test.ts`

Backend ad configuration, VAST, VTV surface и полный набор pixels еще не реализованы.
