# Stats Extension

Статистика playback и рекламы как отдельный extension. Core не знает о providers, VSID, coverage или backend API.

## Entry points

- `src/stats-extension.ts` — event mapping и sessions.
- `src/stats-outbox.ts` — persistent queue с ack/retry/dedup.
- `src/create-stats-extension.ts` — composition factory.
- `src/api-stats-transport.ts` — endpoint transports.
- `src/uv-2025-provider.ts`, `src/one-stat-provider.ts` — serializers.

## Поведение

- Startup, playback, pause/resume, seek, buffering, quality и errors.
- First bytes/frame, TVT, watched-N и VOD/live coverage.
- UV `adv_request`, `adv_break_started`, `adv_break_ended`, `adv_error`.
- VSID с `randomUUID` и legacy fallback.
- Завершение и flush до уничтожения playback session.
- SDK OneStat не дублирует встроенный OneStat на VK path.

## Outbox

Удаляет событие только после подтверждения транспорта, восстанавливает очередь после restart, дедуплицирует по destination + event ID и сохраняет failed events для retry.

## Проверки

- `tests/unit/stats-outbox.test.ts`
- `tests/unit/stats-trace-comparator.test.ts`
- `tests/contract/stats-extension.test.ts`
- `tests/contract/ads-stats.test.ts`
- `tests/contract/stats-transport-factory.test.ts`
- Legacy/new browser traces в `tests/e2e/native-playback.spec.ts`.

Полный production backend parity пока не завершен.
