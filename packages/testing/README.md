# Testing Infrastructure

Общие fake adapters, fixtures и comparators для unit, contract и browser tests.

## Entry points

- `src/fake-adapter.ts` — технический adapter с deferred prepare и injectable events.
- `src/fake-vk-player.ts` — fake VKCore subjects/events.
- `src/fake-clock.ts` — управляемые wall/monotonic clocks.
- `src/fake-stats.ts` — memory storage и fake stats transport.
- `src/stats-trace-comparator.ts` — сравнение event order и payload.
- `src/legacy-vod-trace.ts` — legacy-schema VOD baseline.
- `src/fixtures.ts` — общие capabilities и playlist fixtures.

## Comparator

`compareStatsTraces` и `assertStatsTrace` проверяют destination, порядок, `event_number`, identity и payload. `client_time` и `playback_position` имеют отдельные допуски, а не игнорируются. Поддерживаются exact и subset режимы.

## Browser fixtures

`tests/e2e/fixtures` содержит локальные MP4, HLS master/variant/TS и DASH MPD/init/media segments. Внешняя сеть во время E2E не нужна.

`tests/e2e/server.ts` раздает fixtures, production bundles, legacy bundle и поддерживает HTTP Range для DASH SegmentBase.
