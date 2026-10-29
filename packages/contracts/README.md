# Contracts

Типы и интерфейсы, общие для core, SDK, engines и extensions. Не содержит playback-логики или runtime-зависимостей.

## Entry point

`src/index.ts` экспортирует все публичные контракты.

## Состав

- `playback.ts` — состояния, source, snapshots, core events, adapter/factory и clocks.
- `playlist-item.ts` — playlist item, media files, live, ads, subtitles и TV programme DTO.
- `public-api.ts` — `IPlayerLib`, `PublicPlayback`, `InitData` и playback options.
- `public-events.ts` — карта внешних `CustomEvent` и их payload.
- `extensions.ts` — extension lifecycle и `aroundOpen` orchestration.

## Правила

- Core events сериализуемы и не содержат raw engines, DOM nodes или токены.
- Metadata — непрозрачный конверт для extensions; core его не интерпретирует.
- UI-контракты и `MsgChannel` отсутствуют.
- Изменения публичных типов требуют синхронизации facade, externs и contract tests.
