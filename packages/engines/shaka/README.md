# Shaka Engine

Основной adapter для DASH и HLS на `shaka-player@5.3.2`.

## Entry points

- `src/shaka-adapter.ts` — adapter и factory.
- `src/shaka-player.d.ts` — TypeScript-декларация используемого Shaka API.

## Настройка буфера

- `bufferingGoal: 10` — около 10 секунд запаса впереди позиции.
- `bufferBehind: 2` — до 2 секунд истории позади позиции.
- `rebufferingGoal: 2` — около 2 секунд запаса для продолжения после stall.

После seek активный variant переключается с `clearBuffer=true, safeMargin=0`. На destroy вызывается `unload(false)`, затем `destroy()` и очистка video surface.

## Поведение

- Start position и ожидание фактического `canplay` перед autoplay.
- Auto/manual quality, audio/text tracks и Shaka errors.
- `unload(false)` гарантирует очистку SourceBuffer на destroy.

## Проверки

- `tests/unit/shaka-adapter.test.ts` — buffer limits, seek cleanup, tracks.
- Browser HLS и DASH E2E с локальными fixtures.

Не проверены live/DVR, Chrome 34 и физические Smart TV.
