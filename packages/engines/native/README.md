# Native HTML5 Engine

Native playback через `HTMLVideoElement` и браузерные media events.

## Entry points

- `src/native-html5-adapter.ts` — adapter и factory.
- `src/detect-capabilities.ts` — platform, MIME, MSE и engine capabilities.

## Поведение

- Создает только собственный `<video>` без `controls`.
- Поддерживает `prepare/play/pause/seek/seekLive/stop/destroy`.
- Применяет start position и переводит native events в общий adapter contract.
- Реализует first bytes/frame, buffering, timeupdate и media errors.
- Удаляет только собственный video element, не очищая host-owned children.

Ручное качество и выбор аудио в native adapter ограничены: нужен adaptive adapter или reopen source. Остальные protected extension points используются HLS.js и Shaka adapters.

## Проверки

- `tests/unit/native-html5-adapter.test.ts`
- `tests/unit/detect-capabilities.test.ts`
- Browser native MP4 E2E.
