# TV Channel Extension

TV programme, SCTE-35 и Vitrina lifecycle без UI.

## Entry point

`src/tv-channel-extension.ts` получает `AdsExtension`, dispatcher и typed providers.

## Поведение

- Загружает programme и server time через providers.
- Отправляет `tv-channel-server-time-update` и `tv-channel-programme-update` с current/next.
- По SCTE-35 действиям вызывает `AdsExtension.playMidrollFromTv()`.
- Отправляет `vitrina_tv_first_play_or_ad`, `vitrina_tv_heartbeat` и `vitrina_tv_content_end` через `prod-stat-event`.

## Проверки

- `tests/contract/tv-channel.test.ts`

Настоящий Vitrina SDK, VAST, VTV surface и production TV API еще не проверены.
