# Playback Core

Техническое ядро воспроизведения. Не содержит UI, статистику, рекламу, playlist policy, VK API или `CustomEvent`.

## Entry points

- `src/index.ts` — публичный API package.
- `src/playback-core.ts` — команды и подписка на core events.
- `src/adapter-factory.ts` — registry playback adapters.
- `src/source-planner.ts` — выбор совместимых source candidates.

## Ответственность

- Одна активная `PlaybackSession` с `sessionId` и `mediaEpoch`.
- `open/play/pause/seek/seekLive/stop/destroy`.
- Явный autoplay и сериализация команд.
- Нормализованные состояния и технические snapshots.
- Quality, audio/text tracks, playback rate, volume и capabilities.
- Игнорирование поздних событий и команд старой session.

## Adapter contract

Адаптеры реализуют `PlaybackAdapter`: `prepare`, playback commands, tracks, quality, volume, snapshots и `subscribe`. Реализации находятся в `packages/engines/*`.

## SourcePlanner

Формирует candidates для MP4/HLS/DASH/CMAF с учетом native и MSE capabilities. `canPlayType` ограничивает только native path и не блокирует поддерживаемые JS engines. Recovery выбирает следующий candidate, а не сам planner.

## Проверки

- `tests/unit/playback-core.test.ts`
- `tests/unit/source-planner.test.ts`
- `tests/contract/player-lib.test.ts`
