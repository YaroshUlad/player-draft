# Live Extension

Live-политики и status lifecycle без привязки к UI.

## Entry point

`src/live-extension.ts` получает core, reload callback, dispatcher и optional status provider.

## Поведение

- Отслеживает pause/resume.
- При паузе более 60 секунд вызывает live seek с соответствующим offset.
- Поддерживает `liveCanRewind`.
- Опрашивает live-status provider с cancellation.
- Отправляет `player-live-status-changed` только при изменении статуса.
- Перезагружает контент при `upcoming/waiting → started` и `finished/postlive`.
- Останавливает monitoring и stale callbacks после shutdown.

## Проверки

- `tests/contract/live-runtime-recovery.test.ts`

Настоящий live stream, backend status API и platform-specific live quirks еще не проверены.
