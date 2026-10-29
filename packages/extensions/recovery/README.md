# Recovery Extension

Initial и runtime source fallback без recovery-логики в core.

## Entry point

`src/recovery-extension.ts` использует `SourcePlanner`, capabilities и `aroundOpen`.

## Поведение

- Перебирает source candidates при ошибке initial prepare.
- Повторяет `open` после runtime error с сохранением последней позиции.
- Не запускает параллельный recovery во время initial open.
- Не делает retry для `STALE_OPERATION`.
- Отправляет `playback-is-not-available` после ошибки всех initial candidates и `recover-fail` после исчерпания runtime candidates.

`NextOpen` передает source и start position через всю цепочку orchestration, включая рекламу.

## Проверки

- `tests/contract/playlist-recovery.test.ts`
- `tests/contract/live-runtime-recovery.test.ts`

Offline waiting, refresh item и platform-specific recovery пока не реализованы.
